import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  computeMonthlyReport,
  figuresToCsv,
  figuresToDhis2,
  rollupReports,
  type ReportFigure,
  type ReportInput,
  type ReportMeta,
} from "@phc/shared";
import { PrismaService } from "../prisma/prisma.service";
import { ApiError } from "../common/api-error";
import { inScope, type Principal } from "../common/principal";

/** Wire entity types the report reads, mapped to their input bucket. */
const SOURCE_TYPES = [
  "patient",
  "encounter",
  "pregnancy",
  "anc_visit",
  "delivery",
  "immunization_dose",
  "referral",
];

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  // ---- Generation ----

  /**
   * Compute a facility's month from source rows.
   *
   * Always recomputed for a draft, never cached: a device may sync late, and a
   * draft that silently ignored rows arriving after generation would under-report.
   * A locked report returns its stored figures instead, because immutability is
   * the point of locking.
   */
  async generate(
    principal: Principal,
    facilityId: string,
    year: number,
    month: number,
  ) {
    if (!inScope(principal, facilityId)) throw ApiError.outOfScope();
    if (month < 1 || month > 12) throw ApiError.validation("month must be 1 to 12");

    const existing = await this.prisma.monthlyReport.findUnique({
      where: { facilityId_year_month: { facilityId, year, month } },
      include: { adjustments: true },
    });

    if (existing?.status === "locked") {
      return { ...existing, figures: existing.figures as unknown as ReportFigure[] };
    }

    const figures = await this.computeFigures([facilityId], year, month);

    const saved = await this.prisma.monthlyReport.upsert({
      where: { facilityId_year_month: { facilityId, year, month } },
      create: {
        facilityId,
        year,
        month,
        figures: figures as unknown as Prisma.InputJsonValue,
        generatedBy: principal.userId,
      },
      update: {
        figures: figures as unknown as Prisma.InputJsonValue,
        generatedAt: new Date(),
        generatedBy: principal.userId,
      },
      include: { adjustments: true },
    });

    return { ...saved, figures };
  }

  /** Load the source rows for a set of facilities and run the shared engine. */
  private async computeFigures(
    facilityIds: string[],
    year: number,
    month: number,
  ): Promise<ReportFigure[]> {
    const rows = await this.prisma.syncedEntity.findMany({
      where: {
        entityType: { in: SOURCE_TYPES },
        facilityId: { in: facilityIds },
        deletedAt: null,
      },
    });

    const input: ReportInput = {
      year,
      month,
      patients: [],
      encounters: [],
      pregnancies: [],
      ancVisits: [],
      deliveries: [],
      doses: [],
      referrals: [],
    };

    for (const row of rows) {
      // The engine needs the common columns plus the payload's own fields.
      const record = {
        ...(row.payload as Record<string, unknown>),
        id: row.id,
        facility_id: row.facilityId,
        created_at: row.createdAt.toISOString(),
        deleted_at: null,
      };
      switch (row.entityType) {
        case "patient":
          input.patients.push(record as never);
          break;
        case "encounter":
          input.encounters.push(record as never);
          break;
        case "pregnancy":
          input.pregnancies.push(record as never);
          break;
        case "anc_visit":
          input.ancVisits.push(record as never);
          break;
        case "delivery":
          input.deliveries.push(record as never);
          break;
        case "immunization_dose":
          input.doses.push(record as never);
          break;
        case "referral":
          input.referrals.push(record as never);
          break;
      }
    }

    return computeMonthlyReport(input);
  }

  // ---- Drill-down ----

  /**
   * The rows behind one figure (task 3). This is what makes a number auditable:
   * an officer-in-charge can ask "which 14 deliveries" and get the records.
   */
  async drillDown(principal: Principal, reportId: string, figureKey: string) {
    const report = await this.prisma.monthlyReport.findUnique({ where: { id: reportId } });
    if (!report) throw ApiError.notFound("Report not found");
    if (!inScope(principal, report.facilityId)) throw ApiError.outOfScope();

    const figures = report.figures as unknown as ReportFigure[];
    const figure = figures.find((f) => f.key === figureKey);
    if (!figure) throw ApiError.notFound(`No figure "${figureKey}" in this report`);

    if (figure.derivedFrom) {
      // A percentage has no rows of its own; point at what it came from.
      return { figure, derivedFrom: figure.derivedFrom, rows: [] };
    }

    const rows = await this.prisma.syncedEntity.findMany({
      where: { id: { in: figure.sourceIds }, facilityId: report.facilityId },
      take: 1000,
    });

    return {
      figure,
      rows: rows.map((r) => ({
        id: r.id,
        entityType: r.entityType,
        payload: r.payload,
        updatedAt: r.updatedAt,
      })),
    };
  }

  // ---- Review and lock ----

  /** Locking is the officer-in-charge's sign-off; after it, figures are frozen. */
  async lock(principal: Principal, reportId: string) {
    const report = await this.prisma.monthlyReport.findUnique({ where: { id: reportId } });
    if (!report) throw ApiError.notFound("Report not found");
    if (!inScope(principal, report.facilityId)) throw ApiError.outOfScope();
    if (report.status === "locked") {
      throw ApiError.validation("Report is already locked; corrections go through adjustments");
    }

    const locked = await this.prisma.monthlyReport.update({
      where: { id: reportId },
      data: { status: "locked", lockedAt: new Date(), lockedBy: principal.userId },
    });

    await this.prisma.auditEvent.create({
      data: {
        actorUserId: principal.userId,
        action: "report_locked",
        entityType: "monthly_report",
        entityId: reportId,
        facilityId: report.facilityId,
        details: { year: report.year, month: report.month },
      },
    });
    return locked;
  }

  /**
   * Record a correction against a locked report.
   *
   * The locked figures are never rewritten. NHMIS returns are submitted upward,
   * so the number that was submitted has to stay visible alongside the
   * correction, otherwise a discrepancy with the LGA's copy is unexplainable.
   */
  async addAdjustment(
    principal: Principal,
    reportId: string,
    input: { figureKey: string; toValue: number; reason: string },
  ) {
    const report = await this.prisma.monthlyReport.findUnique({ where: { id: reportId } });
    if (!report) throw ApiError.notFound("Report not found");
    if (!inScope(principal, report.facilityId)) throw ApiError.outOfScope();
    if (report.status !== "locked") {
      throw ApiError.validation("Adjustments apply to a locked report; edit the draft instead");
    }

    const figures = report.figures as unknown as ReportFigure[];
    const figure = figures.find((f) => f.key === input.figureKey);
    if (!figure) throw ApiError.notFound(`No figure "${input.figureKey}" in this report`);

    const adjustment = await this.prisma.reportAdjustment.create({
      data: {
        reportId,
        figureKey: input.figureKey,
        fromValue: figure.value,
        toValue: input.toValue,
        reason: input.reason,
        createdBy: principal.userId,
      },
    });

    await this.prisma.auditEvent.create({
      data: {
        actorUserId: principal.userId,
        action: "report_adjusted",
        entityType: "monthly_report",
        entityId: reportId,
        facilityId: report.facilityId,
        details: { figureKey: input.figureKey, from: figure.value, to: input.toValue },
      },
    });
    return adjustment;
  }

  /** Figures with adjustments applied, which is what an export should carry. */
  effectiveFigures(
    figures: ReportFigure[],
    adjustments: { figureKey: string; toValue: number }[],
  ): ReportFigure[] {
    if (adjustments.length === 0) return figures;
    const latest = new Map<string, number>();
    for (const adjustment of adjustments) latest.set(adjustment.figureKey, adjustment.toValue);
    return figures.map((figure) =>
      latest.has(figure.key)
        ? { ...figure, value: latest.get(figure.key)!, note: "Adjusted after lock" }
        : figure,
    );
  }

  // ---- Export ----

  async export(principal: Principal, reportId: string, format: string) {
    const report = await this.prisma.monthlyReport.findUnique({
      where: { id: reportId },
      include: { adjustments: { orderBy: { createdAt: "asc" } } },
    });
    if (!report) throw ApiError.notFound("Report not found");
    if (!inScope(principal, report.facilityId)) throw ApiError.outOfScope();

    const facility = await this.prisma.facility.findUnique({ where: { id: report.facilityId } });
    const meta: ReportMeta = {
      facility: facility?.name ?? report.facilityId,
      facilityCode: facility?.code ?? report.facilityId,
      year: report.year,
      month: report.month,
    };

    const figures = this.effectiveFigures(
      report.figures as unknown as ReportFigure[],
      report.adjustments,
    );

    await this.prisma.auditEvent.create({
      data: {
        actorUserId: principal.userId,
        action: "report_exported",
        entityType: "monthly_report",
        entityId: reportId,
        facilityId: report.facilityId,
        details: { format, status: report.status },
      },
    });

    if (format === "csv") {
      return { contentType: "text/csv", body: figuresToCsv(figures, meta) };
    }
    if (format === "dhis2") {
      const mapping = this.dhis2Mapping();
      return {
        contentType: "application/json",
        body: JSON.stringify(figuresToDhis2(figures, meta, mapping), null, 2),
      };
    }
    throw ApiError.validation(`Unsupported export format "${format}"; use csv or dhis2`);
  }

  /**
   * DHIS2 data-element mapping, read from configuration.
   *
   * Empty until the LGA supplies its UIDs (Open question Q4). The export names
   * every unmapped element rather than shipping our own keys as if they were
   * DHIS2 identifiers.
   */
  private dhis2Mapping(): Record<string, string> {
    const raw = process.env.DHIS2_ELEMENT_MAP;
    if (!raw) return {};
    try {
      return JSON.parse(raw) as Record<string, string>;
    } catch {
      // A malformed mapping must not silently produce an unmapped export that
      // looks complete; fall back to none, which the export then reports.
      return {};
    }
  }

  // ---- LGA rollup ----

  /**
   * Sum facility reports across the LGA for a month.
   *
   * Draft reports are excluded: a rollup made of unreviewed numbers would be
   * reported upward as though an officer-in-charge had signed it off.
   */
  async lgaRollup(principal: Principal, year: number, month: number) {
    if (principal.facilityScope !== null) {
      throw ApiError.forbidden("LGA rollups require cross-facility scope");
    }

    const reports = await this.prisma.monthlyReport.findMany({
      where: { year, month, status: "locked" },
      include: { adjustments: true },
    });

    const perFacility = reports.map((report) =>
      this.effectiveFigures(report.figures as unknown as ReportFigure[], report.adjustments),
    );

    const draftCount = await this.prisma.monthlyReport.count({
      where: { year, month, status: "draft" },
    });
    const totalFacilities = await this.prisma.facility.count({ where: { active: true } });

    return {
      year,
      month,
      figures: rollupReports(perFacility),
      // Reported explicitly: a rollup covering 3 of 76 facilities is not an
      // LGA figure, and the reader must be able to see that.
      facilitiesIncluded: reports.length,
      facilitiesDraft: draftCount,
      facilitiesTotal: totalFacilities,
    };
  }

  async list(principal: Principal, year?: number, month?: number) {
    return this.prisma.monthlyReport.findMany({
      where: {
        ...(principal.facilityScope ? { facilityId: { in: principal.facilityScope } } : {}),
        ...(year ? { year } : {}),
        ...(month ? { month } : {}),
      },
      orderBy: [{ year: "desc" }, { month: "desc" }],
      take: 100,
    });
  }
}

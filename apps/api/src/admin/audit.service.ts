import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { Principal } from "../common/principal";

/**
 * The audit log viewer.
 *
 * The log is append-only and read-only to viewers: there is no update or delete
 * path here, deliberately. A facility administrator sees their own facility, an
 * LGA officer sees the LGA, a system administrator sees everything.
 *
 * Events with no facility (a config change, for example) are visible only to
 * cross-facility roles, because there is no facility to scope them to.
 */
export interface AuditQuery {
  action?: string;
  entityType?: string;
  actorUserId?: string;
  facilityId?: string;
  from?: string;
  to?: string;
  limit?: number;
  cursor?: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async query(principal: Principal, q: AuditQuery) {
    const take = Math.min(Math.max(q.limit ?? 100, 1), 500);
    const scope = principal.facilityScope;

    const where: Prisma.AuditEventWhereInput = {
      ...(q.action ? { action: q.action } : {}),
      ...(q.entityType ? { entityType: q.entityType } : {}),
      ...(q.actorUserId ? { actorUserId: q.actorUserId } : {}),
      ...(q.from || q.to
        ? {
            at: {
              ...(q.from ? { gte: new Date(q.from) } : {}),
              ...(q.to ? { lte: new Date(q.to) } : {}),
            },
          }
        : {}),
    };

    if (scope !== null) {
      // Facility-bound viewers see their own facilities only, and never the
      // facility-less events.
      where.facilityId = q.facilityId
        ? scope.includes(q.facilityId)
          ? q.facilityId
          : "__out_of_scope__"
        : { in: scope };
    } else if (q.facilityId) {
      where.facilityId = q.facilityId;
    }

    const rows = await this.prisma.auditEvent.findMany({
      where,
      orderBy: { at: "desc" },
      take: take + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;

    return {
      events: page,
      next_cursor: hasMore ? page[page.length - 1].id : null,
      has_more: hasMore,
    };
  }

  /**
   * Export the audit trail as CSV (Phase 9 task 5).
   *
   * Capped, because an unbounded export of a year's trail would exhaust memory
   * and is not what an investigation needs. Narrow the window instead.
   */
  async exportCsv(principal: Principal, q: AuditQuery, maxRows = 10_000) {
    const { events } = await this.query(principal, { ...q, limit: Math.min(maxRows, 10_000) });

    const header = [
      "at",
      "actor_user_id",
      "action",
      "entity_type",
      "entity_id",
      "facility_id",
      "device_id",
      "details",
    ];
    const cell = (value: unknown) => {
      if (value === null || value === undefined) return "";
      const text = typeof value === "object" ? JSON.stringify(value) : String(value);
      return `"${text.replace(/"/g, '""')}"`;
    };

    const lines = [header.join(",")];
    for (const e of events) {
      lines.push(
        [
          cell(e.at.toISOString()),
          cell(e.actorUserId),
          cell(e.action),
          cell(e.entityType),
          cell(e.entityId),
          cell(e.facilityId),
          cell(e.deviceId),
          cell(e.details),
        ].join(","),
      );
    }

    // Exporting the audit trail is itself an auditable act: it takes a copy of
    // who did what out of the system, and the trail should show that happened.
    // Stamped with the facility the export covered, so the administrator who
    // took the copy can see their own action in their own log. A facility-less
    // event is invisible to a facility-scoped viewer, which would make this
    // record exist without being readable by the person it is about.
    const exportFacility =
      q.facilityId ??
      (principal.facilityScope?.length === 1 ? principal.facilityScope[0] : null);

    await this.prisma.auditEvent.create({
      data: {
        actorUserId: principal.userId,
        action: "audit_exported",
        entityType: "audit_event",
        facilityId: exportFacility,
        deviceId: principal.deviceId,
        details: { rows: events.length, filters: q as Prisma.InputJsonValue },
      },
    });

    return { csv: lines.join("\n"), rows: events.length };
  }

  /** Distinct actions present, so the viewer can offer a real filter list. */
  async actions(principal: Principal) {
    const scope = principal.facilityScope;
    const rows = await this.prisma.auditEvent.groupBy({
      by: ["action"],
      where: scope !== null ? { facilityId: { in: scope } } : {},
      _count: { action: true },
      orderBy: { _count: { action: "desc" } },
      take: 50,
    });
    return rows.map((r) => ({ action: r.action, count: r._count.action }));
  }
}

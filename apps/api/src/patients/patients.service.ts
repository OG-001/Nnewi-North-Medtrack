import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ApiError } from "../common/api-error";
import { inScope, type Principal } from "../common/principal";

/**
 * Cross-facility patient access (Global Constraint 8).
 *
 * Patients move between PHCs, so continuity of care has to be possible. It is
 * never provided by widening a query: a clinician searches an LGA-wide index
 * exposing only enough to identify a person, and opening the actual record of
 * another facility's patient is a deliberate, reason-prompted, audited act.
 *
 * This is the NDPA data-minimisation principle expressed in code. Staff do not
 * get blanket access to every record, and care is not blocked when a patient
 * travels.
 */

/** The only fields the LGA-wide index may expose. Never clinical content. */
interface PatientIndexEntry {
  id: string;
  mrn: string;
  display_name: string;
  sex: string | null;
  year_of_birth: number | null;
  home_facility_id: string;
  home_facility_name: string;
  /** True when the caller can already open this record without an audit event. */
  in_scope: boolean;
}

@Injectable()
export class PatientsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Search the LGA-wide minimal index.
   *
   * Deliberately returns identity fields only. A clinician needs enough to know
   * they have found the right person and where the record lives; the record
   * itself requires the audited path below.
   *
   * Only the year of birth is exposed, not the full date: it is sufficient to
   * disambiguate two people with the same name and is less identifying.
   */
  async searchIndex(principal: Principal, query: string, limit = 25) {
    const term = query.trim();
    if (term.length < 3) {
      throw ApiError.validation("Search needs at least 3 characters");
    }

    const take = Math.min(Math.max(limit, 1), 50);
    const pattern = `%${term.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;

    // Filtered in the database, not in memory. An in-memory scan over a capped
    // page silently misses matches once the LGA holds more patients than the
    // cap, which is exactly the case this index exists for.
    const rows = await this.prisma.$queryRaw<
      {
        id: string;
        facility_id: string;
        payload: Record<string, unknown>;
        facility_name: string | null;
      }[]
    >`
      SELECT e.id,
             e.facility_id,
             e.payload,
             f.name AS facility_name
      FROM synced_entity e
      LEFT JOIN facility f ON f.id = e.facility_id
      WHERE e.entity_type = 'patient'
        AND e.deleted_at IS NULL
        AND (
          (e.payload ->> 'first_name') ILIKE ${pattern} ESCAPE '\\'
          OR (e.payload ->> 'last_name') ILIKE ${pattern} ESCAPE '\\'
          OR (e.payload ->> 'mrn') ILIKE ${pattern} ESCAPE '\\'
          OR (e.payload ->> 'phone_primary') ILIKE ${pattern} ESCAPE '\\'
          OR ((e.payload ->> 'last_name') || ' ' || (e.payload ->> 'first_name')) ILIKE ${pattern} ESCAPE '\\'
        )
      ORDER BY e.updated_at DESC
      LIMIT ${take}
    `;

    const results: PatientIndexEntry[] = rows.map((row) => {
      const payload = row.payload ?? {};
      const first = String(payload.first_name ?? "");
      const last = String(payload.last_name ?? "");
      const dob = payload.date_of_birth ? String(payload.date_of_birth) : null;

      return {
        id: row.id,
        mrn: String(payload.mrn ?? ""),
        display_name: `${last} ${first}`.trim() || "Unnamed record",
        sex: payload.sex ? String(payload.sex) : null,
        year_of_birth: dob ? Number(dob.slice(0, 4)) || null : null,
        home_facility_id: row.facility_id,
        home_facility_name: row.facility_name ?? row.facility_id,
        in_scope: inScope(principal, row.facility_id),
      };
    });

    return { query: term, results };
  }

  /**
   * Open a patient record.
   *
   * In scope, this is an ordinary read. Out of scope, it requires a reason and
   * writes a `sensitive_access` audit event before returning anything. The
   * record's home facility is preserved either way: a cross-facility encounter
   * is attributed to where it happened, not moved.
   */
  async openRecord(principal: Principal, patientId: string, reason?: string) {
    const row = await this.prisma.syncedEntity.findUnique({
      where: { entityType_id: { entityType: "patient", id: patientId } },
    });
    if (!row || row.deletedAt) throw ApiError.notFound("Patient not found");

    const withinScope = inScope(principal, row.facilityId);

    if (!withinScope) {
      const trimmed = (reason ?? "").trim();
      if (trimmed.length < 10) {
        throw new ApiError(
          403 as never,
          "REASON_REQUIRED",
          "Opening another facility's patient record requires a reason of at least 10 characters",
        );
      }

      // Audited BEFORE the data is returned: the record of the access must not
      // depend on the response succeeding.
      await this.prisma.auditEvent.create({
        data: {
          actorUserId: principal.userId,
          action: "sensitive_access",
          entityType: "patient",
          entityId: patientId,
          facilityId: row.facilityId,
          deviceId: principal.deviceId,
          details: {
            reason: trimmed,
            accessed_by_facility_scope: principal.facilityScope,
            home_facility_id: row.facilityId,
          },
        },
      });
    }

    return {
      patient: row.payload,
      home_facility_id: row.facilityId,
      cross_facility: !withinScope,
    };
  }

  /** Sensitive-access events, for the audit viewer. Scope-checked. */
  async sensitiveAccessLog(principal: Principal, limit = 100) {
    return this.prisma.auditEvent.findMany({
      where: {
        action: "sensitive_access",
        ...(principal.facilityScope ? { facilityId: { in: principal.facilityScope } } : {}),
      },
      orderBy: { at: "desc" },
      take: Math.min(limit, 500),
    });
  }
}

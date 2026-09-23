import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ApiError } from "../common/api-error";
import { inScope, type Principal } from "../common/principal";

/**
 * Patient duplicate merge (Phase 9, Module 10).
 *
 * Two records for one person is a clinical safety problem, not a tidiness one:
 * a woman's antenatal history split across two records means the clinician sees
 * half of it, and she is counted twice in the monthly return.
 *
 * Merging is hub-mediated by design (offline-sync-design section 5). The hub
 * re-points every child record, soft-deletes the duplicate, and writes a
 * change-log row for each, so every device converges on the same outcome rather
 * than resolving a structural change locally.
 *
 * Nothing is hard-deleted. The merged record survives as a soft-deleted tomb
 * stone carrying `merged_into`, so the merge is reversible in evidence even
 * though the application does not offer an unmerge.
 */

/** Entity types that reference a patient, and the fields that do the referring. */
const PATIENT_REFERENCES: Record<string, string[]> = {
  encounter: ["patient_id"],
  referral: ["patient_id"],
  pregnancy: ["patient_id"],
  anc_schedule_item: ["patient_id"],
  anc_visit: ["patient_id"],
  delivery: ["patient_id", "baby_patient_id"],
  immunization_dose: ["patient_id"],
  queue_entry: ["patient_id"],
  sms_message: ["patient_id"],
  patient_link: ["from_patient_id", "to_patient_id"],
};

export interface DuplicateCandidate {
  id: string;
  mrn: string;
  display_name: string;
  sex: string | null;
  date_of_birth: string | null;
  phone_primary: string | null;
  created_at: string;
  /** Why this record looks like the same person. */
  reasons: string[];
  /** How much history would move if this one were merged away. */
  record_counts: Record<string, number>;
}

@Injectable()
export class PatientMergeService {
  constructor(private readonly prisma: PrismaService) {}

  private async loadPatient(id: string) {
    return this.prisma.syncedEntity.findUnique({
      where: { entityType_id: { entityType: "patient", id } },
    });
  }

  /** How many rows of each type hang off a patient. */
  async recordCounts(patientId: string): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    for (const [entityType, fields] of Object.entries(PATIENT_REFERENCES)) {
      let total = 0;
      for (const field of fields) {
        total += await this.prisma.syncedEntity.count({
          where: {
            entityType,
            deletedAt: null,
            payload: { path: [field], equals: patientId },
          },
        });
      }
      if (total > 0) counts[entityType] = total;
    }
    return counts;
  }

  /**
   * Candidate duplicates for a patient, within the caller's scope.
   *
   * Deliberately conservative: a shared phone number, an identical name, or the
   * same date of birth and sex. A loose matcher that surfaced half the register
   * would train administrators to dismiss the list, which is worse than no list.
   */
  async duplicates(principal: Principal, patientId: string): Promise<DuplicateCandidate[]> {
    const patient = await this.loadPatient(patientId);
    if (!patient || patient.deletedAt) throw ApiError.notFound("Patient not found");
    if (!inScope(principal, patient.facilityId)) throw ApiError.outOfScope();

    const payload = patient.payload as Record<string, unknown>;
    const phone = payload.phone_primary ? String(payload.phone_primary) : null;
    const first = String(payload.first_name ?? "").trim().toLowerCase();
    const last = String(payload.last_name ?? "").trim().toLowerCase();
    const dob = payload.date_of_birth ? String(payload.date_of_birth) : null;
    const sex = payload.sex ? String(payload.sex) : null;

    // Filtered in the database, not scanned in memory. A capped in-memory page
    // silently misses the duplicate once a facility holds more patients than
    // the cap, which is exactly the register this tool exists for.
    const phoneMatch = phone ?? "\u0000";
    const rows = await this.prisma.$queryRaw<
      { id: string; payload: Record<string, unknown>; created_at: Date }[]
    >`
      SELECT id, payload, created_at
      FROM synced_entity
      WHERE entity_type = 'patient'
        AND facility_id = ${patient.facilityId}
        AND deleted_at IS NULL
        AND id <> ${patientId}
        AND (
          (payload ->> 'phone_primary') = ${phoneMatch}
          OR (
            lower(payload ->> 'first_name') = ${first}
            AND lower(payload ->> 'last_name') = ${last}
          )
          OR (
            (payload ->> 'date_of_birth') = ${dob ?? "\u0000"}
            AND (payload ->> 'sex') = ${sex ?? "\u0000"}
          )
        )
      ORDER BY created_at DESC
      LIMIT 20
    `;

    const candidates: DuplicateCandidate[] = [];
    for (const other of rows) {
      const p = other.payload ?? {};
      const reasons: string[] = [];

      const otherPhone = p.phone_primary ? String(p.phone_primary) : null;
      if (phone && otherPhone && phone === otherPhone) reasons.push("Same phone number");

      const otherFirst = String(p.first_name ?? "").trim().toLowerCase();
      const otherLast = String(p.last_name ?? "").trim().toLowerCase();
      if (first && last && first === otherFirst && last === otherLast) {
        reasons.push("Same name");
      }

      const otherDob = p.date_of_birth ? String(p.date_of_birth) : null;
      if (dob && otherDob && dob === otherDob && sex && p.sex === sex) {
        reasons.push("Same date of birth and sex");
      }

      if (reasons.length === 0) continue;

      candidates.push({
        id: other.id,
        mrn: String(p.mrn ?? ""),
        display_name: `${otherLast} ${otherFirst}`.trim() || "Unnamed record",
        sex: p.sex ? String(p.sex) : null,
        date_of_birth: otherDob,
        phone_primary: otherPhone,
        created_at: other.created_at.toISOString(),
        reasons,
        record_counts: await this.recordCounts(other.id),
      });
    }

    // Strongest evidence first.
    candidates.sort((a, b) => b.reasons.length - a.reasons.length);
    return candidates;
  }

  /**
   * Merge `mergedId` into `survivingId`.
   *
   * Only within one facility. A cross-facility merge would move one PHC's
   * clinical history into another's data scope, which is a privacy decision
   * rather than a data-quality one, and the LGA-wide index already covers
   * finding a patient who has moved.
   */
  async merge(
    principal: Principal,
    input: { survivingId: string; mergedId: string; reason: string },
  ) {
    const { survivingId, mergedId, reason } = input;

    if (survivingId === mergedId) {
      throw ApiError.validation("A record cannot be merged into itself");
    }

    const [surviving, merged] = await Promise.all([
      this.loadPatient(survivingId),
      this.loadPatient(mergedId),
    ]);
    if (!surviving || surviving.deletedAt) throw ApiError.notFound("Surviving patient not found");
    if (!merged) throw ApiError.notFound("Duplicate patient not found");

    // Checked before the soft-delete test, so re-merging an already-merged
    // record says where it went rather than reporting it missing.
    const already = await this.prisma.patientMerge.findUnique({ where: { mergedId } });
    if (already) {
      throw ApiError.validation(
        `That record was already merged into ${already.survivingId} on ${already.mergedAt.toISOString().slice(0, 10)}`,
      );
    }
    if (merged.deletedAt) throw ApiError.notFound("Duplicate patient not found");

    if (!inScope(principal, surviving.facilityId) || !inScope(principal, merged.facilityId)) {
      throw ApiError.outOfScope();
    }
    if (surviving.facilityId !== merged.facilityId) {
      throw ApiError.validation(
        "Both records must belong to the same facility. A patient seen at another PHC is found through the LGA-wide index instead.",
      );
    }

    const survivingPayload = surviving.payload as Record<string, unknown>;
    const mergedPayload = merged.payload as Record<string, unknown>;
    const now = new Date();
    const details: Record<string, number> = {};

    await this.prisma.$transaction(
      async (tx) => {
        // 1. Re-point every child record onto the surviving patient.
        for (const [entityType, fields] of Object.entries(PATIENT_REFERENCES)) {
          for (const field of fields) {
            const rows = await tx.syncedEntity.findMany({
              where: {
                entityType,
                facilityId: merged.facilityId,
                deletedAt: null,
                payload: { path: [field], equals: mergedId },
              },
            });

            for (const row of rows) {
              const payload = { ...(row.payload as Record<string, unknown>) };
              payload[field] = survivingId;
              const nextRev = row.rev + 1;
              payload.rev = nextRev;

              // A change-log row per move, so devices converge on the merge
              // rather than each deciding what to do with a re-pointed record.
              const seq = await tx.changeLog.create({
                data: {
                  entityType,
                  entityId: row.id,
                  facilityId: row.facilityId,
                  op: "upsert",
                  rev: nextRev,
                  payload: payload as Prisma.InputJsonValue,
                },
              });
              await tx.syncedEntity.update({
                where: { entityType_id: { entityType, id: row.id } },
                data: {
                  payload: payload as Prisma.InputJsonValue,
                  rev: nextRev,
                  updatedAt: now,
                  serverSeq: seq.serverSeq,
                },
              });
              details[entityType] = (details[entityType] ?? 0) + 1;
            }
          }
        }

        // 2. Fill blanks on the surviving record from the duplicate. A merge
        //    should not lose a phone number that only the duplicate carried.
        const enriched = { ...survivingPayload };
        let enrichedFields = 0;
        for (const [key, value] of Object.entries(mergedPayload)) {
          if (["id", "rev", "mrn", "created_at", "deleted_at"].includes(key)) continue;
          const current = enriched[key];
          const isBlank =
            current === undefined ||
            current === null ||
            current === "" ||
            (Array.isArray(current) && current.length === 0);
          const hasValue =
            value !== undefined && value !== null && value !== "" &&
            !(Array.isArray(value) && value.length === 0);
          if (isBlank && hasValue) {
            enriched[key] = value;
            enrichedFields += 1;
          }
        }

        const survivingRev = surviving.rev + 1;
        enriched.rev = survivingRev;
        const survivingSeq = await tx.changeLog.create({
          data: {
            entityType: "patient",
            entityId: survivingId,
            facilityId: surviving.facilityId,
            op: "upsert",
            rev: survivingRev,
            payload: enriched as Prisma.InputJsonValue,
          },
        });
        await tx.syncedEntity.update({
          where: { entityType_id: { entityType: "patient", id: survivingId } },
          data: {
            payload: enriched as Prisma.InputJsonValue,
            rev: survivingRev,
            updatedAt: now,
            serverSeq: survivingSeq.serverSeq,
          },
        });
        details.fields_filled_from_duplicate = enrichedFields;

        // 3. Soft-delete the duplicate, marked so it is never mistaken for a
        //    deletion. Global Constraint 3: clinical data is never hard-deleted.
        const mergedRev = merged.rev + 1;
        const tombstone = {
          ...mergedPayload,
          rev: mergedRev,
          merged_into: survivingId,
          status: "merged",
        };
        const mergedSeq = await tx.changeLog.create({
          data: {
            entityType: "patient",
            entityId: mergedId,
            facilityId: merged.facilityId,
            op: "delete",
            rev: mergedRev,
            payload: tombstone as Prisma.InputJsonValue,
          },
        });
        await tx.syncedEntity.update({
          where: { entityType_id: { entityType: "patient", id: mergedId } },
          data: {
            payload: tombstone as Prisma.InputJsonValue,
            rev: mergedRev,
            deletedAt: now,
            updatedAt: now,
            serverSeq: mergedSeq.serverSeq,
          },
        });

        // 4. The permanent record of the merge.
        await tx.patientMerge.create({
          data: {
            survivingId,
            mergedId,
            facilityId: surviving.facilityId,
            mergedBy: principal.userId,
            reason,
            details: details as Prisma.InputJsonValue,
          },
        });

        await tx.auditEvent.create({
          data: {
            actorUserId: principal.userId,
            action: "patient_merged",
            entityType: "patient",
            entityId: survivingId,
            facilityId: surviving.facilityId,
            deviceId: principal.deviceId,
            details: {
              merged_id: mergedId,
              merged_mrn: mergedPayload.mrn ?? null,
              reason,
              repointed: details,
            } as Prisma.InputJsonValue,
          },
        });
      },
      // Re-pointing a long history is many small writes; the default 5s is tight.
      { timeout: 30_000 },
    );

    // Draft reports recompute from source on every read, so they correct
    // themselves. A locked report is immutable by design, so the merge cannot
    // silently change a figure that was already submitted: the affected periods
    // are returned so an administrator can decide whether to file an adjustment.
    const affectedLocked = await this.affectedLockedReports(surviving.facilityId, [
      survivingPayload,
      mergedPayload,
    ]);

    return {
      surviving_id: survivingId,
      merged_id: mergedId,
      repointed: details,
      locked_reports_to_review: affectedLocked,
    };
  }

  /** Locked reports whose period could have double-counted the duplicate. */
  private async affectedLockedReports(
    facilityId: string,
    payloads: Record<string, unknown>[],
  ) {
    const periods = new Set<string>();
    for (const payload of payloads) {
      const created = payload.created_at ? new Date(String(payload.created_at)) : null;
      if (created && !Number.isNaN(created.getTime())) {
        periods.add(`${created.getUTCFullYear()}-${created.getUTCMonth() + 1}`);
      }
    }
    if (periods.size === 0) return [];

    const reports = await this.prisma.monthlyReport.findMany({
      where: {
        facilityId,
        status: "locked",
        OR: [...periods].map((p) => {
          const [year, month] = p.split("-").map(Number);
          return { year, month };
        }),
      },
      select: { id: true, year: true, month: true },
    });
    return reports;
  }

  /** Merge history for a facility, for the audit trail. */
  async history(principal: Principal, limit = 100) {
    return this.prisma.patientMerge.findMany({
      where: principal.facilityScope ? { facilityId: { in: principal.facilityScope } } : {},
      orderBy: { mergedAt: "desc" },
      take: Math.min(limit, 500),
    });
  }
}

import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  SYNC_PAGE_LIMIT,
  entityClassOf,
  type BaselineResponse,
  type ChangesResponse,
  type EnrollResponse,
  type PushChange,
  type PushResponse,
  type PushResult,
  type SyncChange,
} from "@phc/shared";
import { PrismaService } from "../prisma/prisma.service";
import { ApiError } from "../common/api-error";
import { inScope, type Principal } from "../common/principal";
import { resolveChange, type Payload } from "./conflict";

/**
 * How far back the baseline snapshot reaches, per entity type
 * (offline-sync-design §7: pull active/recent, page deep history lazily).
 *
 * `null` means "always include" — the small, always-needed rows. Everything else
 * is bounded so a large facility does not ship years of history to a low-end
 * device on first login.
 */
const BASELINE_WINDOW_DAYS: Record<string, number | null> = {
  patient: null, // the roster itself is what makes the device useful offline
  patient_link: null,
  pregnancy: null, // active pregnancies are few and needed in full
  anc_schedule_item: 400, // roughly one pregnancy's worth of schedule
  queue_entry: 7,
  encounter: 365,
  referral: 365,
  anc_visit: 400,
  delivery: 400,
  immunization_dose: 730, // the EPI schedule runs to ~15 months plus catch-up
};

export const DEFAULT_BASELINE_WINDOW_DAYS = 365;

/** Entity types a device holds locally; drives the baseline snapshot. */
const BASELINE_TYPES = [
  "patient",
  "patient_link",
  "encounter",
  "referral",
  "pregnancy",
  "anc_schedule_item",
  "anc_visit",
  "delivery",
  "immunization_dose",
  "queue_entry",
];

@Injectable()
export class SyncService {
  private readonly logger = new Logger("Sync");

  constructor(private readonly prisma: PrismaService) {}

  // ---- Enrolment (offline-sync-design §7) ----

  async enroll(principal: Principal, deviceId: string, label?: string): Promise<EnrollResponse> {
    await this.prisma.device.upsert({
      where: { id: deviceId },
      create: { id: deviceId, userId: principal.userId, label, lastSeenAt: new Date() },
      update: { userId: principal.userId, label, lastSeenAt: new Date(), revokedAt: null },
    });

    const head = await this.headSeq();
    await this.prisma.auditEvent.create({
      data: {
        actorUserId: principal.userId,
        action: "device_enroll",
        deviceId,
        details: { label: label ?? null },
      },
    });

    return {
      device_id: deviceId,
      scope: principal.facilityScope,
      baseline_seq: head,
      server_time: new Date().toISOString(),
    };
  }

  /**
   * A revoked device or a deactivated user cannot sync — revocation takes
   * effect at next contact (offline-sync-design §9).
   */
  private async assertDeviceActive(principal: Principal, deviceId: string) {
    const device = await this.prisma.device.findUnique({ where: { id: deviceId } });
    if (!device) throw ApiError.forbidden("Device is not enrolled");
    if (device.revokedAt) throw ApiError.forbidden("Device enrolment has been revoked");
    if (device.userId !== principal.userId) {
      throw ApiError.forbidden("Device is enrolled to a different user");
    }
    await this.prisma.device.update({
      where: { id: deviceId },
      data: { lastSeenAt: new Date() },
    });
  }

  private async headSeq(): Promise<number> {
    const row = await this.prisma.changeLog.aggregate({ _max: { serverSeq: true } });
    return Number(row._max.serverSeq ?? 0);
  }

  /**
   * Resolve the facility filter for a request. A device may narrow its scope but
   * never widen it — anything outside the principal's scope is a 403, which is
   * the server-side half of the isolation guarantee.
   */
  private resolveScope(principal: Principal, requested?: string[]): string[] | null {
    if (!requested?.length) return principal.facilityScope;
    if (principal.facilityScope === null) return requested;
    const outside = requested.filter((f) => !principal.facilityScope!.includes(f));
    if (outside.length) {
      throw ApiError.outOfScope(`Facilities outside your scope: ${outside.join(", ")}`);
    }
    return requested;
  }

  // ---- Pull (offline-sync-design §3.1) ----

  async changes(
    principal: Principal,
    since: number,
    scope: string[] | undefined,
    limit: number,
  ): Promise<ChangesResponse> {
    const facilityIds = this.resolveScope(principal, scope);
    const take = Math.min(Math.max(limit || SYNC_PAGE_LIMIT, 1), SYNC_PAGE_LIMIT);

    const rows = await this.prisma.changeLog.findMany({
      where: {
        serverSeq: { gt: BigInt(since) },
        ...(facilityIds ? { facilityId: { in: facilityIds } } : {}),
      },
      orderBy: { serverSeq: "asc" },
      take: take + 1, // one extra row tells us whether more remain
    });

    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;

    const changes: SyncChange[] = page.map((r) => ({
      entity_type: r.entityType,
      entity_id: r.entityId,
      op: r.op as "upsert" | "delete",
      rev: r.rev,
      payload: (r.payload as Payload) ?? null,
      server_seq: Number(r.serverSeq),
    }));

    // Watermark advances only across changes we actually returned (§8).
    const nextSeq = page.length ? Number(page[page.length - 1].serverSeq) : since;
    return { changes, next_seq: nextSeq, has_more: hasMore };
  }

  // ---- Baseline snapshot (offline-sync-design §7) ----

  async baseline(
    principal: Principal,
    scope: string[] | undefined,
    cursor: string | null,
    limit: number,
  ): Promise<BaselineResponse> {
    const facilityIds = this.resolveScope(principal, scope);
    const take = Math.min(Math.max(limit || SYNC_PAGE_LIMIT, 1), SYNC_PAGE_LIMIT);

    // Cursor is "entityType|id" — a stable keyset over the composite primary key.
    const [curType, curId] = cursor ? cursor.split("|") : [null, null];

    // Per-type recency bound: rows older than an entity's window are left for
    // lazy fetch rather than shipped in the snapshot.
    const withinWindow = BASELINE_TYPES.map((entityType) => {
      const days =
        BASELINE_WINDOW_DAYS[entityType] === undefined
          ? DEFAULT_BASELINE_WINDOW_DAYS
          : BASELINE_WINDOW_DAYS[entityType];
      if (days === null) return { entityType };
      return {
        entityType,
        updatedAt: { gte: new Date(Date.now() - days * 86_400_000) },
      };
    });

    const rows = await this.prisma.syncedEntity.findMany({
      where: {
        OR: withinWindow,
        deletedAt: null, // a bounded snapshot carries live rows only
        ...(facilityIds ? { facilityId: { in: facilityIds } } : {}),
        ...(curType && curId
          ? {
              AND: [
                {
                  OR: [
                    { entityType: { gt: curType } },
                    { entityType: curType, id: { gt: curId } },
                  ],
                },
              ],
            }
          : {}),
      },
      orderBy: [{ entityType: "asc" }, { id: "asc" }],
      take: take + 1,
    });

    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;

    return {
      changes: page.map((r) => ({
        entity_type: r.entityType,
        entity_id: r.id,
        op: "upsert" as const,
        rev: r.rev,
        payload: r.payload as Payload,
        server_seq: Number(r.serverSeq),
      })),
      cursor: hasMore ? `${page[page.length - 1].entityType}|${page[page.length - 1].id}` : null,
      has_more: hasMore,
      baseline_seq: await this.headSeq(),
    };
  }

  // ---- Push (offline-sync-design §3.2) ----

  async push(
    principal: Principal,
    deviceId: string,
    changes: PushChange[],
  ): Promise<PushResponse> {
    await this.assertDeviceActive(principal, deviceId);

    const results: PushResult[] = [];
    for (const change of changes) {
      try {
        results.push(await this.applyOne(principal, deviceId, change));
      } catch (err) {
        // A poison change is parked as rejected rather than blocking the whole
        // outbox (offline-sync-design §8).
        const reason = err instanceof ApiError ? err.message : "Failed to apply change";
        this.logger.warn(`rejected ${change.entity_type}/${change.entity_id}: ${reason}`);
        results.push({
          entity_id: change.entity_id,
          entity_type: change.entity_type,
          status: "rejected",
          server_rev: 0,
          reason,
        });
      }
    }

    return { results, server_seq: await this.headSeq() };
  }

  /**
   * Apply one pushed change inside a transaction: resolve → upsert entity →
   * append change-log row → audit. Either all of it lands or none of it does.
   */
  private async applyOne(
    principal: Principal,
    deviceId: string,
    change: PushChange,
  ): Promise<PushResult> {
    const { entity_type: entityType, entity_id: entityId } = change;

    if (!entityClassOf(entityType)) {
      throw ApiError.validation(`Unknown entity_type "${entityType}"`);
    }

    const payload = (change.payload ?? {}) as Payload;
    const facilityId = String(payload.facility_id ?? "");
    if (!facilityId) {
      throw ApiError.validation("payload.facility_id is required", [
        { field: "facility_id", issue: "missing" },
      ]);
    }
    if (!inScope(principal, facilityId)) {
      throw ApiError.outOfScope(`Facility ${facilityId} is outside your scope`);
    }

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.syncedEntity.findUnique({
        where: { entityType_id: { entityType, id: entityId } },
      });

      // The payload the client edited from, recovered from the ledger so that
      // field-level merge can tell a real edit from a stale echo.
      let basePayload: Payload | null = null;
      if (existing && change.base_rev < existing.rev) {
        const baseRow = await tx.changeLog.findFirst({
          where: { entityType, entityId, rev: change.base_rev },
          orderBy: { serverSeq: "desc" },
        });
        basePayload = (baseRow?.payload as Payload) ?? null;
      }

      const resolution = resolveChange({
        entityType,
        op: change.op,
        server: existing
          ? { payload: existing.payload as Payload, rev: existing.rev, deletedAt: existing.deletedAt }
          : null,
        clientPayload: payload,
        baseRev: change.base_rev,
        basePayload,
      });

      if (resolution.kind === "reject") {
        throw ApiError.validation(resolution.reason);
      }

      // Nothing to write — an idempotent replay or a hub-authoritative outcome.
      if (resolution.kind === "keep_server") {
        return {
          entity_id: entityId,
          entity_type: entityType,
          status: existing && change.base_rev < existing.rev ? "conflict" : "applied",
          server_rev: existing?.rev ?? change.rev,
          server_payload: (existing?.payload as Payload) ?? null,
        } satisfies PushResult;
      }

      const isDelete = change.op === "delete";
      const nextRev = (existing?.rev ?? 0) + 1;
      const now = new Date();
      const nextPayload = { ...resolution.payload, rev: nextRev };
      const needsReview = resolution.kind === "escalate";

      const seqRow = await tx.changeLog.create({
        data: {
          entityType,
          entityId,
          facilityId,
          op: change.op,
          rev: nextRev,
          payload: nextPayload as Prisma.InputJsonValue,
          originDeviceId: deviceId,
        },
      });

      await tx.syncedEntity.upsert({
        where: { entityType_id: { entityType, id: entityId } },
        create: {
          entityType,
          id: entityId,
          facilityId,
          rev: nextRev,
          payload: nextPayload as Prisma.InputJsonValue,
          createdAt: payload.created_at ? new Date(String(payload.created_at)) : now,
          updatedAt: now,
          deletedAt: isDelete ? now : null,
          originDeviceId: deviceId,
          needsReview,
          serverSeq: seqRow.serverSeq,
        },
        update: {
          rev: nextRev,
          payload: nextPayload as Prisma.InputJsonValue,
          updatedAt: now,
          deletedAt: isDelete ? now : null,
          needsReview: needsReview || existing?.needsReview || false,
          serverSeq: seqRow.serverSeq,
        },
      });

      // Every conflict resolution is audited (§5, closing line).
      if (resolution.kind === "merged" || resolution.kind === "escalate") {
        await tx.auditEvent.create({
          data: {
            actorUserId: principal.userId,
            action: resolution.kind === "escalate" ? "conflict_escalated" : "conflict_resolved",
            entityType,
            entityId,
            facilityId,
            deviceId,
            details:
              resolution.kind === "escalate"
                ? { fields: resolution.fields, base_rev: change.base_rev }
                : { merged_fields: resolution.mergedFields, base_rev: change.base_rev },
          },
        });
      }

      if (resolution.kind === "escalate") {
        // Never silently dropped: both versions go to the admin queue.
        await tx.conflictQueue.create({
          data: {
            entityType,
            entityId,
            facilityId,
            fields: resolution.fields,
            serverPayload: (existing?.payload ?? {}) as Prisma.InputJsonValue,
            clientPayload: payload as Prisma.InputJsonValue,
            deviceId,
          },
        });
      }

      return {
        entity_id: entityId,
        entity_type: entityType,
        status: resolution.kind === "apply" ? "applied" : "conflict",
        server_rev: nextRev,
        server_payload: nextPayload,
        needs_review: needsReview || undefined,
      } satisfies PushResult;
    });
  }
}

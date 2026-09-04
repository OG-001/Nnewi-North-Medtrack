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

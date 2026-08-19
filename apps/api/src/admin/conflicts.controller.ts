import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ApiError } from "../common/api-error";
import { inScope, type Principal } from "../common/principal";

/**
 * Admin conflict queue — the escalation path from offline-sync-design §5.
 * Identity-critical contradictions land here and a human reconciles them.
 */
@Controller("admin/conflicts")
@Roles("facility_admin", "lga_authority", "system_admin")
export class ConflictsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@CurrentUser() user: Principal, @Query("status") status = "open") {
    return this.prisma.conflictQueue.findMany({
      where: {
        status,
        ...(user.facilityScope ? { facilityId: { in: user.facilityScope } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }

  /** Resolve by picking a winning version; the choice is written as a new rev. */
  @Post(":id/resolve")
  async resolve(
    @CurrentUser() user: Principal,
    @Param("id") id: string,
    @Body() body: { choice: "server" | "client" },
  ) {
    const conflict = await this.prisma.conflictQueue.findUnique({ where: { id } });
    if (!conflict) throw ApiError.notFound("Conflict not found");
    if (!inScope(user, conflict.facilityId)) throw ApiError.outOfScope();
    if (conflict.status !== "open") throw ApiError.validation("Conflict already resolved");

    const winning = (
      body.choice === "server" ? conflict.serverPayload : conflict.clientPayload
    ) as Prisma.InputJsonValue;

    return this.prisma.$transaction(async (tx) => {
      const entity = await tx.syncedEntity.findUnique({
        where: { entityType_id: { entityType: conflict.entityType, id: conflict.entityId } },
      });
      if (!entity) throw ApiError.notFound("Entity no longer exists");

      const nextRev = entity.rev + 1;
      const payload = { ...(winning as object), rev: nextRev } as Prisma.InputJsonValue;

      const seqRow = await tx.changeLog.create({
        data: {
          entityType: conflict.entityType,
          entityId: conflict.entityId,
          facilityId: conflict.facilityId,
          op: "upsert",
          rev: nextRev,
          payload,
        },
      });

      await tx.syncedEntity.update({
        where: { entityType_id: { entityType: conflict.entityType, id: conflict.entityId } },
        data: { rev: nextRev, payload, needsReview: false, serverSeq: seqRow.serverSeq, updatedAt: new Date() },
      });

      await tx.auditEvent.create({
        data: {
          actorUserId: user.userId,
          action: "conflict_manually_resolved",
          entityType: conflict.entityType,
          entityId: conflict.entityId,
          facilityId: conflict.facilityId,
          details: { choice: body.choice, fields: conflict.fields },
        },
      });

      return tx.conflictQueue.update({
        where: { id },
        data: { status: "resolved", resolvedBy: user.userId, resolvedAt: new Date() },
      });
    });
  }
}

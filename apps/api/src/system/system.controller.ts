import { Controller, Get, Res } from "@nestjs/common";
import type { Response } from "express";
import { PrismaService } from "../prisma/prisma.service";
import { Public, Roles } from "../common/decorators/roles.decorator";

@Controller("system")
export class SystemController {
  constructor(private readonly prisma: PrismaService) {}

  /** Liveness/readiness for the container orchestrator (api-design §7). */
  @Public()
  @Get("health")
  async health() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: "ok", database: "up", at: new Date().toISOString() };
    } catch {
      return { status: "degraded", database: "down", at: new Date().toISOString() };
    }
  }

  /**
   * Readiness, which is a different question from liveness.
   *
   * Liveness asks "is the process alive"; readiness asks "should traffic be
   * sent here". A hub whose database is unreachable is alive but must not be
   * given clinic traffic, so this returns 503 and the proxy takes it out.
   */
  @Public()
  @Get("ready")
  async ready(@Res({ passthrough: true }) res: Response) {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: "ready" };
    } catch {
      res.status(503);
      return { status: "not_ready", reason: "database_unreachable" };
    }
  }

  /**
   * Operational metrics for the alerts in docs/operations/observability.md.
   *
   * Counts only. No patient identifier appears here, because a metrics endpoint
   * tends to end up in dashboards and log stores with looser access control
   * than the clinical data itself.
   */
  @Roles("facility_admin", "lga_authority", "system_admin")
  @Get("metrics")
  async metrics() {
    const dayAgo = new Date(Date.now() - 86_400_000);
    const [head, devices, staleDevices, openConflicts, smsFailed, smsSkipped, lastBackupProxy] =
      await Promise.all([
        this.prisma.changeLog.aggregate({ _max: { serverSeq: true } }),
        this.prisma.device.count({ where: { revokedAt: null } }),
        // A device that has not synced in 24h is the sync-backlog signal: its
        // clinic may be recording care nobody else can see.
        this.prisma.device.count({
          where: { revokedAt: null, lastSeenAt: { lt: dayAgo } },
        }),
        this.prisma.conflictQueue.count({ where: { status: "open" } }),
        this.prisma.smsMessage.count({ where: { status: "failed", createdAt: { gte: dayAgo } } }),
        this.prisma.smsMessage.count({
          where: { status: "skipped_no_consent", createdAt: { gte: dayAgo } },
        }),
        this.prisma.changeLog.findFirst({ orderBy: { at: "desc" }, select: { at: true } }),
      ]);

    return {
      at: new Date().toISOString(),
      sync: {
        server_seq: Number(head._max.serverSeq ?? 0),
        active_devices: devices,
        devices_stale_24h: staleDevices,
        open_conflicts: openConflicts,
        last_change_at: lastBackupProxy?.at ?? null,
      },
      sms: { failed_24h: smsFailed, skipped_no_consent_24h: smsSkipped },
    };
  }

  @Roles("facility_admin", "lga_authority", "system_admin")
  @Get("sync-status")
  async syncStatus() {
    const [head, devices, openConflicts, entities] = await Promise.all([
      this.prisma.changeLog.aggregate({ _max: { serverSeq: true } }),
      this.prisma.device.count({ where: { revokedAt: null } }),
      this.prisma.conflictQueue.count({ where: { status: "open" } }),
      this.prisma.syncedEntity.count(),
    ]);
    return {
      server_seq: Number(head._max.serverSeq ?? 0),
      active_devices: devices,
      open_conflicts: openConflicts,
      entities,
    };
  }
}

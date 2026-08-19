import { Controller, Get } from "@nestjs/common";
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

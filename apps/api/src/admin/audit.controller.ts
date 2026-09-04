import { Controller, Get, Query } from "@nestjs/common";
import { AuditService } from "./audit.service";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import type { Principal } from "../common/principal";

/** Read-only by construction: there is no write path to the audit log. */
@Controller("audit")
@Roles("facility_admin", "lga_authority", "system_admin")
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  query(
    @CurrentUser() user: Principal,
    @Query("action") action?: string,
    @Query("entityType") entityType?: string,
    @Query("actor") actorUserId?: string,
    @Query("facility") facilityId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("limit") limit?: string,
    @Query("cursor") cursor?: string,
  ) {
    return this.audit.query(user, {
      action,
      entityType,
      actorUserId,
      facilityId,
      from,
      to,
      limit: Number(limit) || undefined,
      cursor,
    });
  }

  @Get("actions")
  actions(@CurrentUser() user: Principal) {
    return this.audit.actions(user);
  }
}

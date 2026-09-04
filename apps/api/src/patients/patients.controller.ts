import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { PatientsService } from "./patients.service";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import type { Principal } from "../common/principal";

@Controller("patients")
export class PatientsController {
  constructor(private readonly patients: PatientsService) {}

  /** LGA-wide minimal index for continuity of care. Identity fields only. */
  @Get("index")
  searchIndex(
    @CurrentUser() user: Principal,
    @Query("query") query = "",
    @Query("limit") limit?: string,
  ) {
    return this.patients.searchIndex(user, query, Number(limit) || 25);
  }

  /**
   * Open a record. Out of scope, a reason is required and the access is
   * audited as `sensitive_access`.
   */
  @Post(":id/access")
  open(
    @CurrentUser() user: Principal,
    @Param("id") id: string,
    @Body() body: { reason?: string },
  ) {
    return this.patients.openRecord(user, id, body?.reason);
  }

  @Roles("facility_admin", "lga_authority", "system_admin")
  @Get("sensitive-access-log")
  log(@CurrentUser() user: Principal, @Query("limit") limit?: string) {
    return this.patients.sensitiveAccessLog(user, Number(limit) || 100);
  }
}

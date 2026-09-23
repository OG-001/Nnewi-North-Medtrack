import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { PatientsService } from "./patients.service";
import { PatientMergeService } from "./merge.service";
import { mergeSchema, type MergeDto } from "./merge.dto";
import { ZodValidationPipe } from "../common/zod.pipe";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import type { Principal } from "../common/principal";

@Controller("patients")
export class PatientsController {
  constructor(
    private readonly patients: PatientsService,
    private readonly merges: PatientMergeService,
  ) {}

  /**
   * Duplicate candidates for a patient. Merging is a clinical-data edit, so it
   * belongs to the officer-in-charge: `patient.merge` is granted to
   * `facility_admin` alone, not to a system administrator.
   */
  @Roles("facility_admin")
  @Get(":id/duplicates")
  duplicates(@CurrentUser() user: Principal, @Param("id") id: string) {
    return this.merges.duplicates(user, id);
  }

  @Roles("facility_admin")
  @Post("merge")
  merge(
    @CurrentUser() user: Principal,
    @Body(new ZodValidationPipe(mergeSchema)) dto: MergeDto,
  ) {
    return this.merges.merge(user, {
      survivingId: dto.surviving_id,
      mergedId: dto.merged_id,
      reason: dto.reason,
    });
  }

  @Roles("facility_admin", "lga_authority", "system_admin")
  @Get("merge/history")
  mergeHistory(@CurrentUser() user: Principal, @Query("limit") limit?: string) {
    return this.merges.history(user, Number(limit) || 100);
  }

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

import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { SyncService } from "./sync.service";
import { enrollSchema, pushSchema, type EnrollDto, type PushDto } from "./sync.dto";
import { ZodValidationPipe } from "../common/zod.pipe";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { Principal } from "../common/principal";

/** Bulk data movement for the PWA (api-design §4). */
@Controller("sync")
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Post("enroll")
  enroll(
    @CurrentUser() user: Principal,
    @Body(new ZodValidationPipe(enrollSchema)) dto: EnrollDto,
  ) {
    return this.sync.enroll(user, dto.device_id, dto.label);
  }

  @Get("changes")
  changes(
    @CurrentUser() user: Principal,
    @Query("since") since?: string,
    @Query("scope") scope?: string,
    @Query("limit") limit?: string,
  ) {
    return this.sync.changes(
      user,
      Number(since ?? 0),
      scope ? scope.split(",").filter(Boolean) : undefined,
      Number(limit ?? 0),
    );
  }

  @Get("baseline")
  baseline(
    @CurrentUser() user: Principal,
    @Query("scope") scope?: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit?: string,
  ) {
    return this.sync.baseline(
      user,
      scope ? scope.split(",").filter(Boolean) : undefined,
      cursor ?? null,
      Number(limit ?? 0),
    );
  }

  @Post("push")
  push(
    @CurrentUser() user: Principal,
    @Body(new ZodValidationPipe(pushSchema)) dto: PushDto,
  ) {
    return this.sync.push(user, dto.device_id, dto.changes);
  }
}

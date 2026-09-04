import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { StaffService } from "./staff.service";
import {
  createUserSchema,
  resetPinSchema,
  updateUserSchema,
  type CreateUserDto,
  type ResetPinDto,
  type UpdateUserDto,
} from "./admin.dto";
import { ZodValidationPipe } from "../common/zod.pipe";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import type { Principal } from "../common/principal";

@Controller("admin/staff")
@Roles("facility_admin", "system_admin")
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Get()
  list(@CurrentUser() user: Principal, @Query("facility") facility?: string) {
    return this.staff.list(user, facility);
  }

  @Post()
  create(
    @CurrentUser() user: Principal,
    @Body(new ZodValidationPipe(createUserSchema)) dto: CreateUserDto,
  ) {
    return this.staff.create(user, dto);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: Principal,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateUserSchema)) dto: UpdateUserDto,
  ) {
    return this.staff.update(user, id, dto);
  }

  @Post(":id/reset-pin")
  resetPin(
    @CurrentUser() user: Principal,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(resetPinSchema)) dto: ResetPinDto,
  ) {
    return this.staff.resetPin(user, id, dto.pin);
  }
}

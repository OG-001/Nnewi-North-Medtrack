import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { FacilitiesService } from "./facilities.service";
import {
  createFacilitySchema,
  updateFacilitySchema,
  type CreateFacilityDto,
  type UpdateFacilityDto,
} from "./admin.dto";
import { ZodValidationPipe } from "../common/zod.pipe";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { Public } from "../common/decorators/roles.decorator";
import type { Principal } from "../common/principal";

@Controller("facilities")
export class FacilitiesController {
  constructor(private readonly facilities: FacilitiesService) {}

  /**
   * The facility list is public: the door screen shows it before anyone has
   * signed in. It carries no patient data and no staff data.
   */
  @Public()
  @Get()
  list(@Query("includeInactive") includeInactive?: string) {
    return this.facilities.list(includeInactive === "true");
  }

  @Roles("facility_admin", "lga_authority", "system_admin")
  @Get("staff-counts")
  staffCounts() {
    return this.facilities.staffCounts();
  }

  /** A facility is the unit of data isolation, so only a system admin creates one. */
  @Roles("system_admin")
  @Post()
  create(
    @CurrentUser() user: Principal,
    @Body(new ZodValidationPipe(createFacilitySchema)) dto: CreateFacilityDto,
  ) {
    return this.facilities.create(user, dto);
  }

  @Roles("system_admin")
  @Patch(":id")
  update(
    @CurrentUser() user: Principal,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateFacilitySchema)) dto: UpdateFacilityDto,
  ) {
    return this.facilities.update(user, id, dto);
  }
}

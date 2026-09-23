import { Body, Controller, Get, Param, Put } from "@nestjs/common";
import { ClinicalConfigService } from "./config.service";
import { FacilityPermissionsService } from "../common/facility-permissions.service";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import type { Principal } from "../common/principal";

/**
 * Clinical configuration. Any authenticated user may read it, because every
 * device needs it to schedule correctly. Only an administrator may change it.
 */
@Controller("config")
export class ClinicalConfigController {
  constructor(
    private readonly config: ClinicalConfigService,
    private readonly permissions: FacilityPermissionsService,
  ) {}

  @Get()
  getAll() {
    return this.config.getAll();
  }

  @Get(":key")
  get(@Param("key") key: string) {
    return this.config.get(key);
  }

  @Roles("facility_admin", "system_admin")
  @Put(":key")
  async put(
    @CurrentUser() user: Principal,
    @Param("key") key: string,
    @Body() body: { value: unknown },
  ) {
    // The role allows it; the facility may still have switched it off.
    await this.permissions.assert(user, "schedule.edit");
    return this.config.put(user, key, body?.value);
  }
}

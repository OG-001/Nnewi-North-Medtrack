import { Global, Injectable, Module } from "@nestjs/common";
import {
  DEFAULT_FACILITY_PERMISSIONS,
  can,
  withdrawnPermissions,
  type FacilityPermissionsConfig,
  type Permission,
} from "@phc/shared";
import { PrismaService } from "../prisma/prisma.service";
import { ApiError } from "./api-error";
import type { Principal } from "./principal";

/**
 * Enforces per-facility permission withdrawals on the hub.
 *
 * The role guards answer "what kind of user is this". This answers the second
 * question the plan asks for: whether this facility has switched that
 * permission off for that role. A withdrawal can only ever take a permission
 * away, so the role matrix stays the ceiling.
 *
 * Enforcing it here and not only in the UI is the difference between a workflow
 * hint and a control.
 */
@Injectable()
export class FacilityPermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  private async load(): Promise<FacilityPermissionsConfig> {
    const row = await this.prisma.appConfig.findUnique({ where: { key: "facility_permissions" } });
    if (!row) return DEFAULT_FACILITY_PERMISSIONS;
    return row.value as unknown as FacilityPermissionsConfig;
  }

  /**
   * Refuse when `permission` has been withdrawn for this caller's roles at any
   * facility in their scope. An LGA-wide caller has no single facility, so no
   * withdrawal applies.
   */
  async assert(principal: Principal, permission: Permission): Promise<void> {
    if (principal.facilityScope === null || principal.facilityScope.length === 0) return;

    const config = await this.load();
    for (const facilityId of principal.facilityScope) {
      const withdrawn = withdrawnPermissions(config, facilityId, principal.roles);
      if (!can(principal.roles, permission, withdrawn)) {
        throw ApiError.forbidden(
          `"${permission}" has been switched off for your role at this facility`,
        );
      }
    }
  }
}

@Global()
@Module({ providers: [FacilityPermissionsService], exports: [FacilityPermissionsService] })
export class FacilityPermissionsModule {}

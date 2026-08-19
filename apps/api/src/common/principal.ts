import type { Role } from "@phc/shared";

/** The authenticated caller, resolved from the JWT (api-design §2 claims). */
export interface Principal {
  userId: string;
  username: string;
  roles: Role[];
  /** Facility ids the caller may touch. `null` = LGA-wide (all facilities). */
  facilityScope: string[] | null;
  deviceId?: string;
}

const CROSS_FACILITY_ROLES: Role[] = ["lga_authority", "system_admin"];

export function isCrossFacility(roles: Role[]): boolean {
  return roles.some((r) => CROSS_FACILITY_ROLES.includes(r));
}

/** True when the caller may read/write rows belonging to `facilityId`. */
export function inScope(principal: Principal, facilityId: string): boolean {
  if (principal.facilityScope === null) return true;
  return principal.facilityScope.includes(facilityId);
}

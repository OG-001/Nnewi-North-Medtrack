/**
 * RBAC permission model — mirrors product/user-roles-and-permissions.md §2.
 * A permission check passes only if the role grants the action AND the target is
 * in the user's data scope (scope is enforced separately at the data layer).
 */
import type { Role } from "./enums";

export const PERMISSIONS = [
  "patient.register",
  "patient.read",
  "patient.merge",
  "emr.read",
  "emr.write",
  "prescribe",
  "diagnose",
  "referral.write",
  "anc.manage",
  "immunization.record",
  "queue.manage",
  "sms.send",
  "sms.template.edit",
  "report.view",
  "report.lga",
  "report.lock",
  "staff.manage",
  "facility.manage",
  "schedule.edit",
  "audit.view",
  "sync.health.view",
  "system.configure",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const NONE: Permission[] = [];

/** Base permission grants per role (defaults from the matrix; some are
 * facility-configurable per footnotes 1–3 — represented here as the defaults). */
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  records_clerk: ["patient.register", "patient.read", "queue.manage", "emr.read"],
  nurse_midwife: [
    "patient.register",
    "patient.read",
    "emr.read",
    "emr.write",
    "prescribe",
    "diagnose",
    "referral.write",
    "anc.manage",
    "immunization.record",
    "queue.manage",
    "sms.send",
    "report.view",
  ],
  chew: [
    "patient.register",
    "patient.read",
    "emr.read",
    "emr.write",
    "prescribe",
    "referral.write",
    "anc.manage",
    "immunization.record",
    "queue.manage",
    "sms.send",
    "report.view",
  ],
  doctor_mo: [
    "patient.read",
    "emr.read",
    "emr.write",
    "prescribe",
    "diagnose",
    "referral.write",
    "anc.manage",
    "immunization.record",
    "queue.manage",
    "sms.send",
    "report.view",
  ],
  facility_admin: [
    "patient.register",
    "patient.read",
    "patient.merge",
    "emr.read",
    "referral.write",
    "queue.manage",
    "sms.send",
    "sms.template.edit",
    "report.view",
    "report.lock",
    "staff.manage",
    "facility.manage",
    "schedule.edit",
    "audit.view",
    "sync.health.view",
  ],
  lga_authority: [
    "patient.read",
    "emr.read",
    "report.view",
    "report.lga",
    "audit.view",
  ],
  system_admin: [
    "patient.read",
    "sms.send",
    "sms.template.edit",
    "report.view",
    "staff.manage",
    "facility.manage",
    "schedule.edit",
    "audit.view",
    "sync.health.view",
    "system.configure",
  ],
};

/** Effective permissions = union over a user's roles. */
export function permissionsForRoles(roles: Role[]): Set<Permission> {
  const set = new Set<Permission>();
  for (const r of roles) for (const p of ROLE_PERMISSIONS[r] ?? NONE) set.add(p);
  return set;
}

/**
 * Does any of `roles` grant `permission`?
 *
 * `withdrawn` are permissions a facility has switched off for this user's roles
 * (see `withdrawnPermissions` in app-config.ts). A facility may only ever take a
 * permission away: the role matrix is the ceiling, never the floor, so this is
 * applied after the grant rather than before it.
 */
export function can(
  roles: Role[],
  permission: Permission,
  withdrawn: readonly Permission[] = [],
): boolean {
  if (withdrawn.includes(permission)) return false;
  return roles.some((r) => (ROLE_PERMISSIONS[r] ?? NONE).includes(permission));
}

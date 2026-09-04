import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import * as argon2 from "argon2";
import type { Role } from "@phc/shared";
import { PrismaService } from "../prisma/prisma.service";
import { ApiError } from "../common/api-error";
import { isCrossFacility, type Principal } from "../common/principal";
import type { CreateUserDto, UpdateUserDto } from "./admin.dto";

/**
 * Staff administration (Phase 9, and the server half of Phase 1).
 *
 * Until now this lived only on the device, which meant a disabled account was
 * still active at the hub: deactivation did not actually revoke anything. It
 * does here, and that is the point of moving it server-side.
 *
 * Two privileges are separated deliberately. A facility administrator runs the
 * staff of their own PHC. Granting LGA-wide or system-admin roles, and creating
 * facilities, belongs to a system administrator, because those roles can read
 * across every facility in the LGA.
 */

/** Roles a facility administrator may never grant: each one crosses facilities. */
const ELEVATED_ROLES: Role[] = ["lga_authority", "system_admin"];

@Injectable()
export class StaffService {
  constructor(private readonly prisma: PrismaService) {}

  private isSystemAdmin(principal: Principal): boolean {
    return principal.roles.includes("system_admin");
  }

  /** A facility admin acts only within their own facilities. */
  private assertMayAdministerFacilities(principal: Principal, facilityIds: string[]) {
    if (this.isSystemAdmin(principal) || principal.facilityScope === null) return;
    const outside = facilityIds.filter((id) => !principal.facilityScope!.includes(id));
    if (outside.length) {
      throw ApiError.outOfScope(
        `You may only manage staff at your own facilities; outside: ${outside.join(", ")}`,
      );
    }
  }

  /**
   * A facility administrator may not administer a user who holds a
   * cross-facility role, even one attached to their own facility.
   *
   * Without this, administration is a privilege-escalation path rather than a
   * scope-limited one: reset an LGA officer's PIN, sign in as them, and read
   * every facility in the LGA. Checking facility overlap alone is not enough,
   * because an M&E officer may legitimately be based at a single PHC.
   *
   * The rule is about the target's privileges, not their job title. A facility
   * administrator managing another facility administrator is lateral: same
   * scope, same powers, no escalation.
   */
  private assertMayAdministerUser(principal: Principal, target: { roles: string[] }) {
    if (this.isSystemAdmin(principal)) return;
    const elevated = (target.roles as Role[]).filter((r) => ELEVATED_ROLES.includes(r));
    if (elevated.length) {
      throw ApiError.forbidden(
        `Only a system administrator may administer an account holding: ${elevated.join(", ")}`,
      );
    }
  }

  /** Only a system admin may grant a role that reads across facilities. */
  private assertMayGrantRoles(principal: Principal, roles: Role[]) {
    if (this.isSystemAdmin(principal)) return;
    const elevated = roles.filter((r) => ELEVATED_ROLES.includes(r));
    if (elevated.length) {
      throw ApiError.forbidden(
        `Only a system administrator may grant: ${elevated.join(", ")}`,
      );
    }
  }

  /** Never return a credential, not even a hash. */
  private present(user: {
    id: string;
    username: string;
    fullName: string;
    phone: string | null;
    roles: string[];
    status: string;
    lastLoginAt: Date | null;
    facilities?: { facilityId: string }[];
  }) {
    return {
      id: user.id,
      username: user.username,
      full_name: user.fullName,
      phone: user.phone,
      roles: user.roles,
      status: user.status,
      last_login_at: user.lastLoginAt,
      facility_ids: user.facilities?.map((f) => f.facilityId) ?? [],
    };
  }

  async list(principal: Principal, facilityId?: string) {
    const scope = principal.facilityScope;
    const users = await this.prisma.user.findMany({
      where: {
        facilities: {
          some: {
            facilityId: facilityId
              ? facilityId
              : scope
                ? { in: scope }
                : undefined,
          },
        },
      },
      include: { facilities: true },
      orderBy: { fullName: "asc" },
      take: 500,
    });

    // A facility administrator sees only the accounts they can actually act on.
    // Listing an LGA officer they cannot touch produces a confusing 403 and
    // advertises an account worth attacking.
    const visible = this.isSystemAdmin(principal)
      ? users
      : users.filter((u) => !(u.roles as Role[]).some((r) => ELEVATED_ROLES.includes(r)));

    return visible.map((u) => this.present(u));
  }

  async create(principal: Principal, dto: CreateUserDto) {
    this.assertMayAdministerFacilities(principal, dto.facility_ids);
    this.assertMayGrantRoles(principal, dto.roles as Role[]);

    // Usernames are unique per facility, not globally, so the collision check
    // is against the facilities this account is being created for.
    const clash = await this.prisma.user.findFirst({
      where: {
        username: dto.username,
        facilities: { some: { facilityId: { in: dto.facility_ids } } },
      },
      include: { facilities: true },
    });
    if (clash) {
      throw ApiError.validation(
        `"${dto.username}" is already in use at one of those facilities`,
      );
    }

    const id = `u-${dto.username}-${Date.now().toString(36)}`;
    const user = await this.prisma.user.create({
      data: {
        id,
        username: dto.username,
        fullName: dto.full_name,
        phone: dto.phone,
        pinHash: await argon2.hash(dto.pin),
        roles: dto.roles,
        status: "active",
        facilities: {
          createMany: { data: dto.facility_ids.map((facilityId) => ({ facilityId })) },
        },
      },
      include: { facilities: true },
    });

    await this.audit(principal, "staff_created", user.id, dto.facility_ids[0], {
      username: dto.username,
      roles: dto.roles,
      facility_ids: dto.facility_ids,
    });

    return this.present(user);
  }

  async update(principal: Principal, userId: string, dto: UpdateUserDto) {
    const existing = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { facilities: true },
    });
    if (!existing) throw ApiError.notFound("Staff account not found");

    this.assertMayAdministerFacilities(
      principal,
      existing.facilities.map((f) => f.facilityId),
    );
    this.assertMayAdministerUser(principal, existing);
    if (dto.roles) this.assertMayGrantRoles(principal, dto.roles as Role[]);
    if (dto.facility_ids) this.assertMayAdministerFacilities(principal, dto.facility_ids);

    // An administrator must not be able to lock themselves out, and must not be
    // able to quietly drop their own oversight either.
    if (userId === principal.userId && dto.status && dto.status !== "active") {
      throw ApiError.validation("You cannot deactivate your own account");
    }

    const user = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: userId },
        data: {
          fullName: dto.full_name,
          phone: dto.phone,
          roles: dto.roles,
          status: dto.status,
        },
      });

      if (dto.facility_ids) {
        await tx.userFacility.deleteMany({ where: { userId } });
        await tx.userFacility.createMany({
          data: dto.facility_ids.map((facilityId) => ({ userId, facilityId })),
          skipDuplicates: true,
        });
      }

      // Deactivation has to actually revoke access, or "disabled" is a label.
      // Refresh tokens go immediately; the short-lived access token expires on
      // its own, and the device loses offline access at its next online check.
      if (dto.status && dto.status !== "active") {
        await tx.refreshToken.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await tx.device.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }

      return tx.user.findUniqueOrThrow({
        where: { id: updated.id },
        include: { facilities: true },
      });
    });

    await this.audit(
      principal,
      dto.status && dto.status !== existing.status ? "staff_status_changed" : "staff_updated",
      userId,
      existing.facilities[0]?.facilityId,
      {
        from_status: existing.status,
        to_status: dto.status ?? existing.status,
        roles: dto.roles ?? existing.roles,
      },
    );

    return this.present(user);
  }

  /** Reset a PIN. The new PIN is never echoed back. */
  async resetPin(principal: Principal, userId: string, pin: string) {
    const existing = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { facilities: true },
    });
    if (!existing) throw ApiError.notFound("Staff account not found");
    this.assertMayAdministerFacilities(
      principal,
      existing.facilities.map((f) => f.facilityId),
    );
    this.assertMayAdministerUser(principal, existing);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { pinHash: await argon2.hash(pin) } });
      // A reset credential invalidates the old sessions: if the reason for the
      // reset was a compromise, leaving them alive defeats it.
      await tx.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });

    await this.audit(principal, "staff_pin_reset", userId, existing.facilities[0]?.facilityId, {});
    return { ok: true };
  }

  private async audit(
    principal: Principal,
    action: string,
    entityId: string,
    facilityId: string | undefined,
    details: Record<string, unknown>,
  ) {
    await this.prisma.auditEvent.create({
      data: {
        actorUserId: principal.userId,
        action,
        entityType: "user_account",
        entityId,
        facilityId,
        deviceId: principal.deviceId,
        details: details as Prisma.InputJsonValue,
      },
    });
  }

  static isCrossFacilityRole(roles: Role[]): boolean {
    return isCrossFacility(roles);
  }
}

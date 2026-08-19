import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import * as argon2 from "argon2";
import { createHash, randomBytes } from "node:crypto";
import type { Role } from "@phc/shared";
import { PrismaService } from "../prisma/prisma.service";
import { ApiError } from "../common/api-error";
import { isCrossFacility } from "../common/principal";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: { id: string; username: string; fullName: string };
  roles: Role[];
  scope: string[] | null;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /**
   * PIN login scoped to one facility. A nurse provisioned at facility A cannot
   * sign in at facility B — the scoped-authentication layer from RUNNING.md,
   * now enforced server-side rather than only in the client.
   */
  async login(username: string, pin: string, facilityId: string, deviceId?: string) {
    // The same username exists at several PHCs, so the account is resolved by
    // (username, facility) — a nurse provisioned at facility A simply has no
    // account at facility B and cannot sign in there.
    const user = await this.prisma.user.findFirst({
      where: { username, facilities: { some: { facilityId } } },
      include: { facilities: true },
    });

    // Uniform failure: never reveal whether the username exists.
    const invalid = () => ApiError.unauthenticated("Invalid username, PIN, or facility");
    if (!user || user.status !== "active") throw invalid();

    const ok = await argon2.verify(user.pinHash, pin).catch(() => false);
    if (!ok) throw invalid();

    const roles = user.roles as Role[];
    const crossFacility = isCrossFacility(roles);
    const facilityIds = user.facilities.map((f) => f.facilityId);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    await this.prisma.auditEvent.create({
      data: {
        actorUserId: user.id,
        action: "login",
        facilityId,
        deviceId,
        details: { username },
      },
    });

    const scope = crossFacility ? null : facilityIds;
    return this.issue(user.id, user.username, user.fullName, roles, scope, deviceId);
  }

  private async issue(
    userId: string,
    username: string,
    fullName: string,
    roles: Role[],
    scope: string[] | null,
    deviceId?: string,
  ): Promise<LoginResult> {
    const accessToken = await this.jwt.signAsync(
      { sub: userId, username, roles, facilityScope: scope, deviceId },
      { expiresIn: this.config.get("ACCESS_TOKEN_TTL", "15m") },
    );

    const refreshToken = randomBytes(48).toString("base64url");
    const days = Number(this.config.get("REFRESH_TOKEN_TTL_DAYS", "30"));
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: hashToken(refreshToken),
        deviceId,
        expiresAt: new Date(Date.now() + days * 86_400_000),
      },
    });

    return {
      accessToken,
      refreshToken,
      user: { id: userId, username, fullName },
      roles,
      scope,
    };
  }

  /** Rotating refresh: the presented token is revoked as a new one is issued. */
  async refresh(refreshToken: string) {
    const row = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
      include: { user: { include: { facilities: true } } },
    });
    if (!row || row.revokedAt || row.expiresAt < new Date()) {
      throw ApiError.unauthenticated("Refresh token invalid or expired");
    }
    if (row.user.status !== "active") {
      throw ApiError.forbidden("Account is not active");
    }

    await this.prisma.refreshToken.update({
      where: { id: row.id },
      data: { revokedAt: new Date() },
    });

    const roles = row.user.roles as Role[];
    const scope = isCrossFacility(roles)
      ? null
      : row.user.facilities.map((f) => f.facilityId);
    return this.issue(
      row.user.id,
      row.user.username,
      row.user.fullName,
      roles,
      scope,
      row.deviceId ?? undefined,
    );
  }

  async logout(refreshToken: string) {
    await this.prisma.refreshToken
      .updateMany({
        where: { tokenHash: hashToken(refreshToken), revokedAt: null },
        data: { revokedAt: new Date() },
      })
      .catch(() => undefined);
    return { ok: true };
  }

  static hashPin(pin: string): Promise<string> {
    return argon2.hash(pin);
  }
}

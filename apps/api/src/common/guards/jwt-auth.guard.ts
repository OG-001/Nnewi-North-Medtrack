import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Reflector } from "@nestjs/core";
import { ApiError } from "../api-error";
import { PUBLIC_KEY } from "../decorators/roles.decorator";
import type { Principal } from "../principal";

/**
 * Verifies the access token and attaches the Principal. Deactivated users and
 * revoked devices are rejected at the sync layer on next contact
 * (offline-sync-design §9).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) throw ApiError.unauthenticated();

    try {
      const claims = await this.jwt.verifyAsync(header.slice(7));
      const principal: Principal = {
        userId: claims.sub,
        username: claims.username,
        roles: claims.roles ?? [],
        // `null` is meaningful: it is LGA-wide scope for an oversight role, and
        // it must survive. `?? []` would collapse it to "no facilities", which
        // denies an LGA officer everything instead of granting them oversight.
        // A missing claim still falls back to the most restrictive value.
        facilityScope: claims.facilityScope === undefined ? [] : claims.facilityScope,
        deviceId: claims.deviceId,
      };
      req.principal = principal;
      return true;
    } catch {
      throw new ApiError(401 as never, "TOKEN_EXPIRED", "Access token invalid or expired");
    }
  }
}

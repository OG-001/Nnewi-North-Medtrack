import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiError } from "../common/api-error";

/**
 * A kill switch for the whole SMS surface.
 *
 * SMS is switched off for this deployment: the running cost of a provider was
 * not justified for the pilot. The module is left in place rather than deleted,
 * because the work is done and turning it back on should be a configuration
 * change, not a rebuild.
 *
 * Enforced at the hub rather than by hiding buttons. A disabled feature that a
 * stale client, a queued job, or a direct request can still reach is not
 * disabled, and here reaching it would mean a real message to a real patient
 * and a real bill.
 *
 * Delivery webhooks are deliberately NOT behind this guard: a provider may
 * still call back about a message sent before SMS was switched off, and
 * dropping that would leave the send log permanently wrong.
 */
@Injectable()
export class SmsEnabledGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(_context: ExecutionContext): boolean {
    if (this.config.get("SMS_ENABLED") === "true") return true;
    throw new ApiError(
      503 as never,
      "SMS_DISABLED",
      "SMS is switched off for this deployment. Set SMS_ENABLED=true to enable it.",
    );
  }
}

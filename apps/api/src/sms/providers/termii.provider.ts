import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { SmsStatus } from "@phc/shared";
import {
  SmsProviderError,
  type DeliveryUpdate,
  type SmsProvider,
  type SmsSendRequest,
  type SmsSendResult,
} from "./provider.interface";

/** Termii delivery states mapped onto our common vocabulary. */
const STATUS_MAP: Record<string, SmsStatus> = {
  Sent: "sent",
  Pending: "queued",
  Queued: "queued",
  Delivered: "delivered",
  "Message Sent": "sent",
  "Message Delivered": "delivered",
  "Delivery Failed": "failed",
  Failed: "failed",
  Rejected: "failed",
  Expired: "failed",
  DND: "failed", // recipient is on the do-not-disturb list
};

@Injectable()
export class TermiiProvider implements SmsProvider {
  readonly name = "termii" as const;
  private readonly logger = new Logger("SmsTermii");

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return !!this.config.get("TERMII_API_KEY");
  }

  async send(message: SmsSendRequest): Promise<SmsSendResult> {
    const apiKey = this.config.getOrThrow<string>("TERMII_API_KEY");
    const baseUrl = this.config.get<string>("TERMII_BASE_URL", "https://api.ng.termii.com/api");
    const senderId =
      message.senderId ?? this.config.get<string>("SMS_SENDER_ID", "PHCTrack");

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/sms/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: message.to,
          from: senderId,
          sms: message.body,
          type: "plain",
          channel: "generic",
          api_key: apiKey,
        }),
      });
    } catch (err) {
      throw new SmsProviderError(`Network error: ${(err as Error).message}`, true, this.name);
    }

    if (!response.ok) {
      const transient = response.status >= 500 || response.status === 429;
      throw new SmsProviderError(`HTTP ${response.status}`, transient, this.name);
    }

    const body = (await response.json()) as { message_id?: string; code?: string };
    if (!body.message_id) {
      throw new SmsProviderError("No message_id in response", false, this.name);
    }
    return { providerMessageId: body.message_id, status: "sent" };
  }

  parseDeliveryWebhook(payload: unknown): DeliveryUpdate | null {
    // Termii wraps the report in a `data` envelope.
    const outer = payload as { type?: string; data?: Record<string, unknown> } | null;
    const data = (outer?.data ?? outer) as
      | { message_id?: string; status?: string }
      | null;
    if (!data?.message_id || !data.status) return null;
    const status = STATUS_MAP[data.status];
    if (!status) return null;
    return { providerMessageId: data.message_id, status };
  }

  verifyWebhookSignature(rawBody: string, headers: Record<string, string>): boolean {
    const secret = this.config.get<string>("TERMII_WEBHOOK_SECRET");
    if (!secret) {
      this.logger.warn("TERMII_WEBHOOK_SECRET is not set; rejecting delivery callback");
      return false;
    }
    const provided = headers["x-termii-signature"] ?? headers["X-Termii-Signature"];
    if (!provided) return false;

    const expected = createHmac("sha512", secret).update(rawBody).digest("hex");
    const a = Buffer.from(expected);
    const b = Buffer.from(provided);
    return a.length === b.length && timingSafeEqual(a, b);
  }
}

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

/** Africa's Talking delivery states mapped onto our common vocabulary. */
const STATUS_MAP: Record<string, SmsStatus> = {
  Sent: "sent",
  Submitted: "sent",
  Buffered: "queued",
  Queued: "queued",
  Success: "delivered",
  Delivered: "delivered",
  Failed: "failed",
  Rejected: "failed",
  Expired: "failed",
  DeliveryFailure: "failed",
};

@Injectable()
export class AfricasTalkingProvider implements SmsProvider {
  readonly name = "africastalking" as const;
  private readonly logger = new Logger("SmsAfricasTalking");

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return !!this.config.get("AT_API_KEY") && !!this.config.get("AT_USERNAME");
  }

  async send(message: SmsSendRequest): Promise<SmsSendResult> {
    const apiKey = this.config.getOrThrow<string>("AT_API_KEY");
    const username = this.config.getOrThrow<string>("AT_USERNAME");
    const baseUrl = this.config.get<string>(
      "AT_BASE_URL",
      "https://api.africastalking.com/version1",
    );

    const form = new URLSearchParams({
      username,
      to: message.to,
      message: message.body,
    });
    const senderId = message.senderId ?? this.config.get<string>("SMS_SENDER_ID");
    if (senderId) form.set("from", senderId);

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/messaging`, {
        method: "POST",
        headers: {
          apiKey,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: form.toString(),
      });
    } catch (err) {
      // Network-level failure: worth trying the next provider.
      throw new SmsProviderError(`Network error: ${(err as Error).message}`, true, this.name);
    }

    if (!response.ok) {
      // 5xx and 429 are the provider's problem and may succeed elsewhere.
      const transient = response.status >= 500 || response.status === 429;
      throw new SmsProviderError(`HTTP ${response.status}`, transient, this.name);
    }

    const body = (await response.json()) as {
      SMSMessageData?: { Recipients?: { messageId?: string; status?: string }[] };
    };
    const recipient = body.SMSMessageData?.Recipients?.[0];
    if (!recipient?.messageId) {
      throw new SmsProviderError("No messageId in response", false, this.name);
    }

    return {
      providerMessageId: recipient.messageId,
      status: STATUS_MAP[recipient.status ?? ""] ?? "sent",
    };
  }

  parseDeliveryWebhook(payload: unknown): DeliveryUpdate | null {
    const data = payload as { id?: string; status?: string } | null;
    if (!data?.id || !data.status) return null;
    const status = STATUS_MAP[data.status];
    if (!status) return null;
    return { providerMessageId: data.id, status };
  }

  verifyWebhookSignature(rawBody: string, headers: Record<string, string>): boolean {
    const secret = this.config.get<string>("AT_WEBHOOK_SECRET");
    if (!secret) {
      // Refuse rather than accept: an unverified callback must not be able to
      // rewrite a send log (NDPA, and api-design section 7).
      this.logger.warn("AT_WEBHOOK_SECRET is not set; rejecting delivery callback");
      return false;
    }
    const provided = headers["x-signature"] ?? headers["X-Signature"];
    if (!provided) return false;

    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    const a = Buffer.from(expected);
    const b = Buffer.from(provided);
    return a.length === b.length && timingSafeEqual(a, b);
  }
}

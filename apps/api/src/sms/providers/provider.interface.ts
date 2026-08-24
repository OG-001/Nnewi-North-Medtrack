/**
 * Provider-agnostic SMS contract (api-design.md section 6).
 *
 * Both Nigerian providers satisfy this, so switching between them is a config
 * change and never a code change. Nothing above this interface knows which
 * provider is in use.
 */
import type { SmsStatus } from "@phc/shared";

export const SMS_PROVIDER_NAMES = ["africastalking", "termii"] as const;
export type SmsProviderName = (typeof SMS_PROVIDER_NAMES)[number];

export interface SmsSendRequest {
  to: string;
  body: string;
  senderId?: string;
}

export interface SmsSendResult {
  providerMessageId: string;
  status: SmsStatus;
}

export interface DeliveryUpdate {
  providerMessageId: string;
  status: SmsStatus;
}

/**
 * A failure the provider reports. `transient` drives failover: a timeout or a
 * 5xx is worth retrying with the next provider, while a rejected number is not.
 */
export class SmsProviderError extends Error {
  constructor(
    message: string,
    readonly transient: boolean,
    readonly provider: SmsProviderName,
  ) {
    super(message);
    this.name = "SmsProviderError";
  }
}

export interface SmsProvider {
  readonly name: SmsProviderName;

  /** True when the adapter has the credentials it needs to send. */
  isConfigured(): boolean;

  send(message: SmsSendRequest): Promise<SmsSendResult>;

  /**
   * Map a provider's delivery callback onto the common status vocabulary.
   * Returns null when the payload is not a delivery report we recognise.
   */
  parseDeliveryWebhook(payload: unknown): DeliveryUpdate | null;

  /**
   * Verify a webhook is genuinely from the provider. Delivery callbacks are
   * public endpoints, so an unverified payload must never update a send log.
   */
  verifyWebhookSignature(rawBody: string, headers: Record<string, string>): boolean;
}

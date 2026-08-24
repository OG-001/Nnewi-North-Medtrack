/**
 * Provider adapters and the failover decision.
 *
 * These cover the parts that must not need a live provider to be trustworthy:
 * status mapping, webhook signature verification, and which errors are worth
 * failing over on.
 */
import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import { AfricasTalkingProvider } from "../src/sms/providers/africastalking.provider";
import { TermiiProvider } from "../src/sms/providers/termii.provider";
import { SmsProviderError } from "../src/sms/providers/provider.interface";

const config = (values: Record<string, string>) =>
  new ConfigService({ ...values });

describe("Africa's Talking adapter", () => {
  const provider = new AfricasTalkingProvider(
    config({ AT_API_KEY: "k", AT_USERNAME: "u", AT_WEBHOOK_SECRET: "shhh" }),
  );

  it("reports itself configured only with credentials", () => {
    expect(provider.isConfigured()).toBe(true);
    expect(new AfricasTalkingProvider(config({})).isConfigured()).toBe(false);
  });

  it("maps provider statuses onto the common vocabulary", () => {
    expect(provider.parseDeliveryWebhook({ id: "m1", status: "Success" })).toEqual({
      providerMessageId: "m1",
      status: "delivered",
    });
    expect(provider.parseDeliveryWebhook({ id: "m1", status: "Failed" })?.status).toBe("failed");
    expect(provider.parseDeliveryWebhook({ id: "m1", status: "Buffered" })?.status).toBe("queued");
  });

  it("ignores a payload that is not a delivery report", () => {
    expect(provider.parseDeliveryWebhook({})).toBeNull();
    expect(provider.parseDeliveryWebhook({ id: "m1", status: "Nonsense" })).toBeNull();
    expect(provider.parseDeliveryWebhook(null)).toBeNull();
  });

  it("accepts a correctly signed webhook", () => {
    const body = JSON.stringify({ id: "m1", status: "Success" });
    const signature = createHmac("sha256", "shhh").update(body).digest("hex");
    expect(provider.verifyWebhookSignature(body, { "x-signature": signature })).toBe(true);
  });

  it("rejects a tampered or unsigned webhook", () => {
    const body = JSON.stringify({ id: "m1", status: "Success" });
    const signature = createHmac("sha256", "shhh").update(body).digest("hex");
    expect(provider.verifyWebhookSignature("tampered", { "x-signature": signature })).toBe(false);
    expect(provider.verifyWebhookSignature(body, {})).toBe(false);
  });

  it("rejects every webhook when no secret is configured", () => {
    // Failing closed matters: an open callback could rewrite the send log.
    const unconfigured = new AfricasTalkingProvider(config({ AT_API_KEY: "k", AT_USERNAME: "u" }));
    const body = "{}";
    expect(unconfigured.verifyWebhookSignature(body, { "x-signature": "anything" })).toBe(false);
  });
});

describe("Termii adapter", () => {
  const provider = new TermiiProvider(config({ TERMII_API_KEY: "k", TERMII_WEBHOOK_SECRET: "s" }));

  it("reads the status from Termii's data envelope", () => {
    expect(
      provider.parseDeliveryWebhook({
        type: "outbound",
        data: { message_id: "t1", status: "Delivered" },
      }),
    ).toEqual({ providerMessageId: "t1", status: "delivered" });
  });

  it("also accepts a flat payload", () => {
    expect(provider.parseDeliveryWebhook({ message_id: "t1", status: "Sent" })?.status).toBe("sent");
  });

  it("treats a do-not-disturb rejection as failed", () => {
    expect(provider.parseDeliveryWebhook({ message_id: "t1", status: "DND" })?.status).toBe("failed");
  });

  it("verifies its sha512 signature", () => {
    const body = JSON.stringify({ message_id: "t1", status: "Delivered" });
    const signature = createHmac("sha512", "s").update(body).digest("hex");
    expect(provider.verifyWebhookSignature(body, { "x-termii-signature": signature })).toBe(true);
    expect(provider.verifyWebhookSignature(body, { "x-termii-signature": "no" })).toBe(false);
  });
});

describe("failover classification", () => {
  it("marks a network error transient so the next provider is tried", () => {
    const err = new SmsProviderError("Network error", true, "africastalking");
    expect(err.transient).toBe(true);
  });

  it("marks a rejected message permanent so it is not retried elsewhere", () => {
    const err = new SmsProviderError("No messageId in response", false, "africastalking");
    expect(err.transient).toBe(false);
  });
});

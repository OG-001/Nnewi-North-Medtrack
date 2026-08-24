/**
 * Typed client for the hub's SMS endpoints.
 *
 * SMS is deliberately an **online-only** feature: dispatch happens at the hub,
 * which holds the provider credentials. That does not weaken the offline-first
 * rule, because sending a reminder is not a clinic workflow that care waits on.
 * Every call here can fail with the hub unreachable, and callers must handle it.
 */
import type { Language, SmsTemplateKey, SmsStatus } from "@phc/shared";
import { apiFetch, hasHubSession } from "./api";

export interface HubSmsTemplate {
  key: SmsTemplateKey;
  description: string;
  bodies: Record<Language, string>;
}

export interface HubSmsMessage {
  id: string;
  patientId: string;
  templateKey: string;
  language: Language;
  renderedBody: string;
  toPhone: string;
  status: SmsStatus;
  skippedReason: string | null;
  failureReason: string | null;
  provider: string | null;
  segments: number;
  triggeredBy: string;
  createdAt: string;
}

export interface HubSmsStats {
  byStatus: Partial<Record<SmsStatus, number>>;
  totalSegments: number;
}

export interface SendOutcome {
  id: string;
  status: SmsStatus;
  skippedReason?: string;
  provider?: string;
}

export function smsAvailable(): boolean {
  return hasHubSession();
}

export function fetchTemplates(): Promise<HubSmsTemplate[]> {
  return apiFetch<HubSmsTemplate[]>("/sms/templates");
}

export function saveTemplate(
  key: string,
  bodies: { en: string; ig: string },
  description?: string,
): Promise<unknown> {
  return apiFetch(`/sms/templates/${key}`, {
    method: "PUT",
    body: JSON.stringify({ body_en: bodies.en, body_ig: bodies.ig, description }),
  });
}

export function fetchMessages(params: { patientId?: string; status?: string; limit?: number } = {}) {
  const query = new URLSearchParams();
  if (params.patientId) query.set("patientId", params.patientId);
  if (params.status) query.set("status", params.status);
  if (params.limit) query.set("limit", String(params.limit));
  const suffix = query.toString() ? `?${query}` : "";
  return apiFetch<HubSmsMessage[]>(`/sms/messages${suffix}`);
}

export function fetchStats(): Promise<HubSmsStats> {
  return apiFetch<HubSmsStats>("/sms/stats");
}

/**
 * Send one reminder. `messageId` is supplied by the caller so that a retry
 * after a dropped response does not message the patient twice.
 */
export function sendReminder(input: {
  patientId: string;
  templateKey: SmsTemplateKey;
  fields?: Record<string, string>;
  messageId?: string;
}): Promise<SendOutcome> {
  return apiFetch<SendOutcome>("/sms/send", {
    method: "POST",
    body: JSON.stringify({
      patient_id: input.patientId,
      template_key: input.templateKey,
      fields: input.fields,
      message_id: input.messageId,
    }),
  });
}

export function sendBulk(input: {
  patientIds: string[];
  templateKey: SmsTemplateKey;
  fields?: Record<string, string>;
}): Promise<{ sent: number; skipped: number; failed: number }> {
  return apiFetch("/sms/send-bulk", {
    method: "POST",
    body: JSON.stringify({
      patient_ids: input.patientIds,
      template_key: input.templateKey,
      fields: input.fields,
    }),
  });
}

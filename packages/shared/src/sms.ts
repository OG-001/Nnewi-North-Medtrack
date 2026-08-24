/**
 * SMS domain: templates, merge-field rendering, phone normalisation and the
 * consent gate (phase-7-sms-notifications.md).
 *
 * This lives in the shared package because the hub dispatches messages and the
 * PWA composes and previews them. If the two rendered a template differently,
 * a nurse would preview one message and a patient would receive another.
 *
 * Everything here is pure. No provider, no network, no clock.
 */
import type { Language } from "./enums";

// ---- Status ----

/** Common status vocabulary every provider's own statuses map onto. */
export const SMS_STATUSES = [
  "queued",
  "sent",
  "delivered",
  "failed",
  "skipped_no_consent",
] as const;
export type SmsStatus = (typeof SMS_STATUSES)[number];

/** Statuses that are settled: no further provider callback will change them. */
export const TERMINAL_SMS_STATUSES: SmsStatus[] = [
  "delivered",
  "failed",
  "skipped_no_consent",
];

// ---- Templates ----

export const SMS_TEMPLATE_KEYS = [
  "anc_reminder",
  "immunization_reminder",
  "missed_visit_recall",
  "general_notice",
] as const;
export type SmsTemplateKey = (typeof SMS_TEMPLATE_KEYS)[number];

export interface SmsTemplate {
  key: SmsTemplateKey;
  /** One body per language; `preferred_language` picks the variant. */
  bodies: Record<Language, string>;
  description: string;
}

/**
 * Seed templates. Admin-editable at runtime (Global Constraint 9: schedules and
 * templates are configuration, not code), so these are defaults, not the truth.
 *
 * Message content is deliberately minimal. Under the Nigeria Data Protection
 * Act the provider is a data processor, so a message carries only what the
 * patient must know to attend: no diagnosis, no clinical detail.
 */
export const DEFAULT_SMS_TEMPLATES: Record<SmsTemplateKey, SmsTemplate> = {
  anc_reminder: {
    key: "anc_reminder",
    description: "Upcoming antenatal visit",
    bodies: {
      en: "Hello {{name}}, your antenatal visit is due on {{date}} at {{facility}}. Please come with your card.",
      ig: "Ndewo {{name}}, oge nlereanya ime gi ruru na {{date}} na {{facility}}. Biko weta kaadi gi.",
    },
  },
  immunization_reminder: {
    key: "immunization_reminder",
    description: "Upcoming childhood immunization",
    bodies: {
      en: "Hello {{name}}, your child's immunization is due on {{date}} at {{facility}}. Please bring the immunization card.",
      ig: "Ndewo {{name}}, ogwu mgbochi nwa gi ruru na {{date}} na {{facility}}. Biko weta kaadi ogwu mgbochi.",
    },
  },
  missed_visit_recall: {
    key: "missed_visit_recall",
    description: "Missed visit, recall to the facility",
    bodies: {
      en: "Hello {{name}}, we missed you at {{facility}} on {{date}}. Please visit us as soon as you can.",
      ig: "Ndewo {{name}}, anyi ahughi gi na {{facility}} na {{date}}. Biko bia leta anyi ozugbo i nwere ike.",
    },
  },
  general_notice: {
    key: "general_notice",
    description: "General facility notice",
    bodies: {
      en: "Hello {{name}}, a message from {{facility}}: {{message}}",
      ig: "Ndewo {{name}}, ozi si na {{facility}}: {{message}}",
    },
  },
};

export function isSmsTemplateKey(value: string): value is SmsTemplateKey {
  return (SMS_TEMPLATE_KEYS as readonly string[]).includes(value);
}

// ---- Rendering ----

export type MergeFields = Record<string, string | number | null | undefined>;

/** Merge fields a template may reference. Unknown placeholders are an error. */
export const KNOWN_MERGE_FIELDS = ["name", "date", "facility", "message"] as const;

const PLACEHOLDER = /\{\{\s*([a-z_]+)\s*\}\}/g;

/**
 * Substitute `{{field}}` placeholders.
 *
 * A missing value renders as an empty string rather than leaving `{{name}}`
 * visible in a message to a patient. Call {@link validateTemplateBody} when an
 * admin saves a template so the mistake is caught at edit time instead.
 */
export function renderTemplate(body: string, fields: MergeFields): string {
  return body
    .replace(PLACEHOLDER, (_match, field: string) => {
      const value = fields[field];
      return value === undefined || value === null ? "" : String(value);
    })
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** Placeholders a template body references, in order of first appearance. */
export function templateFields(body: string): string[] {
  const found: string[] = [];
  for (const match of body.matchAll(PLACEHOLDER)) {
    if (!found.includes(match[1])) found.push(match[1]);
  }
  return found;
}

export interface TemplateProblem {
  field: string;
  issue: string;
}

/** Validate an admin's template edit before it can reach a patient. */
export function validateTemplateBody(body: string): TemplateProblem[] {
  const problems: TemplateProblem[] = [];
  if (!body.trim()) {
    problems.push({ field: "body", issue: "Message body cannot be empty" });
  }
  for (const field of templateFields(body)) {
    if (!(KNOWN_MERGE_FIELDS as readonly string[]).includes(field)) {
      problems.push({ field, issue: `Unknown merge field "{{${field}}}"` });
    }
  }
  // A single GSM-7 segment is 160 characters; longer messages bill per segment.
  if (body.length > 480) {
    problems.push({ field: "body", issue: "Body exceeds three SMS segments" });
  }
  return problems;
}

/** Pick the body for a patient's language, falling back to English. */
export function selectBody(template: SmsTemplate, language: Language): string {
  return template.bodies[language] || template.bodies.en;
}

// ---- Segments and cost bucket ----

/** GSM-7 segment count. Used for the cost bucket on the send log. */
export function segmentCount(body: string): number {
  if (body.length === 0) return 0;
  if (body.length <= 160) return 1;
  // Concatenated messages carry a 7-character header per segment.
  return Math.ceil(body.length / 153);
}

// ---- Phone normalisation ----

/**
 * Normalise a Nigerian number to E.164, or return null when it cannot be.
 *
 * Handles the forms staff actually type: `08031234567`, `8031234567`,
 * `234 803 123 4567`, `+234-803-123-4567`.
 */
export function normalizeToE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, "");
  if (!digits) return null;

  let national: string;
  if (digits.startsWith("+234")) national = digits.slice(4);
  else if (digits.startsWith("234")) national = digits.slice(3);
  else if (digits.startsWith("0")) national = digits.slice(1);
  else national = digits.replace(/^\+/, "");

  // Nigerian mobile numbers are 10 national digits and never start with 0.
  if (!/^[1-9]\d{9}$/.test(national)) return null;
  return `+234${national}`;
}

export function isValidE164(phone: string | null | undefined): boolean {
  return !!phone && /^\+\d{8,15}$/.test(phone);
}

// ---- Consent gate ----

/** The minimum a recipient must satisfy before a message may be dispatched. */
export interface SmsRecipient {
  sms_consent: boolean;
  phone_primary?: string | null;
  preferred_language?: Language;
  status?: string;
}

export type SmsGateReason =
  | "no_consent"
  | "no_valid_phone"
  | "patient_inactive";

export type SmsGateResult =
  | { allowed: true; to: string; language: Language }
  | { allowed: false; reason: SmsGateReason };

/**
 * Decide whether a patient may be messaged.
 *
 * This is the single place consent is enforced. Every send path, automatic,
 * manual and bulk, goes through it: a patient without recorded consent or
 * without a usable number is never messaged, and a deceased or transferred
 * patient is never messaged either.
 */
export function checkSmsGate(recipient: SmsRecipient): SmsGateResult {
  if (!recipient.sms_consent) return { allowed: false, reason: "no_consent" };

  if (recipient.status && recipient.status !== "active") {
    return { allowed: false, reason: "patient_inactive" };
  }

  const to = normalizeToE164(recipient.phone_primary);
  if (!to) return { allowed: false, reason: "no_valid_phone" };

  return { allowed: true, to, language: recipient.preferred_language ?? "en" };
}

export const SMS_GATE_REASON_LABELS: Record<SmsGateReason, string> = {
  no_consent: "No SMS consent recorded",
  no_valid_phone: "No valid phone number",
  patient_inactive: "Patient record is not active",
};

// ---- Quiet hours ----

/** Messages are not dispatched outside these hours, in facility local time. */
export interface QuietHours {
  /** Inclusive start hour, 0 to 23. Sends resume at this hour. */
  startHour: number;
  /** Exclusive end hour, 0 to 23. Sends stop at this hour. */
  endHour: number;
}

export const DEFAULT_SEND_WINDOW: QuietHours = { startHour: 8, endHour: 20 };

/** True when `hour` falls inside the allowed send window. */
export function withinSendWindow(hour: number, window: QuietHours = DEFAULT_SEND_WINDOW): boolean {
  const { startHour, endHour } = window;
  if (startHour === endHour) return true; // no restriction configured
  if (startHour < endHour) return hour >= startHour && hour < endHour;
  // A window that wraps past midnight, e.g. 20:00 to 08:00.
  return hour >= startHour || hour < endHour;
}

/** Default lead time, in days, between the reminder and the due date. */
export const DEFAULT_REMINDER_LEAD_DAYS = 2;

/**
 * SMS against a live hub: the consent gate, RBAC, idempotency and the send log.
 *
 * No provider is configured in this environment, so a permitted send settles as
 * `queued` rather than `sent`. That is the correct observable outcome and it
 * still exercises every decision before the provider call: consent, scope,
 * language selection, rendering and the log entry.
 */
import { beforeAll, describe, expect, it } from "vitest";

const API = process.env.E2E_API_URL ?? "http://localhost:3100/api/v1";
const FACILITY = "fac-0062";
const hubUp = process.env.PHC_HUB_UP === "1";

let nurseToken = "";
let adminToken = "";

const RUN = Math.random().toString(16).slice(2, 10).padEnd(8, "0");
let seq = 0;
const nextId = () => `${RUN}-0000-4000-8000-${String(++seq).padStart(12, "0")}`;

async function api(path: string, init: RequestInit = {}, token = nurseToken) {
  return fetch(`${API}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
}

async function login(username: string, pin: string) {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, pin, facility_id: FACILITY, device_id: "dev-sms" }),
  });
  return ((await res.json()) as { accessToken: string }).accessToken;
}

/** Push a patient through the sync hub so SMS has someone to message. */
async function createPatient(overrides: Record<string, unknown>) {
  const id = nextId();
  await api("/sync/push", {
    method: "POST",
    body: JSON.stringify({
      device_id: "dev-sms",
      changes: [
        {
          entity_type: "patient",
          entity_id: id,
          op: "upsert",
          rev: 1,
          base_rev: 0,
          payload: {
            facility_id: FACILITY,
            first_name: "Test",
            last_name: "Recipient",
            status: "active",
            preferred_language: "en",
            ...overrides,
          },
          client_ts: new Date().toISOString(),
        },
      ],
    }),
  });
  return id;
}

beforeAll(async () => {
  if (!hubUp) return;
  nurseToken = await login("nurse", "2222");
  adminToken = await login("admin", "5555");
  await api("/sync/enroll", {
    method: "POST",
    body: JSON.stringify({ device_id: "dev-sms", label: "sms tests" }),
  });
}, 30_000);

describe.skipIf(!hubUp)("SMS against a live hub", () => {
  it("serves the seeded templates in English and Igbo", async () => {
    const res = await api("/sms/templates");
    const templates = (await res.json()) as { key: string; bodies: Record<string, string> }[];
    const anc = templates.find((t) => t.key === "anc_reminder");
    expect(anc?.bodies.en).toContain("{{name}}");
    expect(anc?.bodies.ig).toBeTruthy();
  });

  it("never messages a patient who has not consented", async () => {
    const patientId = await createPatient({
      sms_consent: false,
      phone_primary: "+2348031234567",
    });
    const res = await api("/sms/send", {
      method: "POST",
      body: JSON.stringify({ patient_id: patientId, template_key: "anc_reminder" }),
    });
    const outcome = (await res.json()) as { status: string; skippedReason: string };
    expect(outcome.status).toBe("skipped_no_consent");
    expect(outcome.skippedReason).toBe("no_consent");
  });

  it("never messages a consenting patient with no usable number", async () => {
    const patientId = await createPatient({ sms_consent: true, phone_primary: "12345" });
    const res = await api("/sms/send", {
      method: "POST",
      body: JSON.stringify({ patient_id: patientId, template_key: "anc_reminder" }),
    });
    const outcome = (await res.json()) as { status: string; skippedReason: string };
    expect(outcome.status).toBe("skipped_no_consent");
    expect(outcome.skippedReason).toBe("no_valid_phone");
  });

  it("records a blocked send rather than dropping it silently", async () => {
    const patientId = await createPatient({ sms_consent: false, phone_primary: "08031234567" });
    await api("/sms/send", {
      method: "POST",
      body: JSON.stringify({ patient_id: patientId, template_key: "anc_reminder" }),
    });

    const res = await api(`/sms/messages?patientId=${patientId}`);
    const log = (await res.json()) as { status: string; skippedReason: string }[];
    expect(log).toHaveLength(1);
    expect(log[0].status).toBe("skipped_no_consent");
  });

  it("renders the message for a consenting patient and logs it", async () => {
    const patientId = await createPatient({
      sms_consent: true,
      phone_primary: "08031234567",
      first_name: "Ngozi",
      last_name: "Eze",
    });
    await api("/sms/send", {
      method: "POST",
      body: JSON.stringify({
        patient_id: patientId,
        template_key: "anc_reminder",
        fields: { date: "12 Sep" },
      }),
    });

    const res = await api(`/sms/messages?patientId=${patientId}`);
    const [message] = (await res.json()) as {
      renderedBody: string;
      toPhone: string;
      segments: number;
    }[];
    expect(message.renderedBody).toContain("Ngozi Eze");
    expect(message.renderedBody).toContain("12 Sep");
    expect(message.renderedBody).not.toContain("{{");
    // Normalised on the way out, whatever the clerk typed.
    expect(message.toPhone).toBe("+2348031234567");
    expect(message.segments).toBeGreaterThan(0);
  });

  it("selects the Igbo variant for an Igbo-speaking patient", async () => {
    const patientId = await createPatient({
      sms_consent: true,
      phone_primary: "08039876543",
      preferred_language: "ig",
    });
    await api("/sms/send", {
      method: "POST",
      body: JSON.stringify({ patient_id: patientId, template_key: "anc_reminder" }),
    });

    const res = await api(`/sms/messages?patientId=${patientId}`);
    const [message] = (await res.json()) as { renderedBody: string; language: string }[];
    expect(message.language).toBe("ig");
    expect(message.renderedBody).toContain("Ndewo");
  });

  it("is idempotent: a re-sent offline message is not delivered twice", async () => {
    const patientId = await createPatient({ sms_consent: true, phone_primary: "08031112222" });
    const messageId = nextId();
    const body = JSON.stringify({
      patient_id: patientId,
      template_key: "anc_reminder",
      message_id: messageId,
    });

    await api("/sms/send", { method: "POST", body });
    await api("/sms/send", { method: "POST", body }); // the retry

    const res = await api(`/sms/messages?patientId=${patientId}`);
    const log = (await res.json()) as unknown[];
    expect(log).toHaveLength(1);
  });

  it("refuses a template edit from a nurse", async () => {
    const res = await api(
      "/sms/templates/anc_reminder",
      { method: "PUT", body: JSON.stringify({ body_en: "x", body_ig: "y" }) },
      nurseToken,
    );
    expect(res.status).toBe(403);
  });

  it("refuses a bulk send from a nurse", async () => {
    const res = await api(
      "/sms/send-bulk",
      {
        method: "POST",
        body: JSON.stringify({ patient_ids: ["whatever"], template_key: "anc_reminder" }),
      },
      nurseToken,
    );
    expect(res.status).toBe(403);
  });

  it("lets an admin edit a template, and rejects an unknown merge field", async () => {
    const bad = await api(
      "/sms/templates/anc_reminder",
      {
        method: "PUT",
        body: JSON.stringify({ body_en: "Hi {{nam}}", body_ig: "Ndewo {{name}}" }),
      },
      adminToken,
    );
    expect(bad.status).toBe(400);

    const good = await api(
      "/sms/templates/general_notice",
      {
        method: "PUT",
        body: JSON.stringify({
          body_en: "Notice for {{name}} at {{facility}}: {{message}}",
          body_ig: "Ozi maka {{name}} na {{facility}}: {{message}}",
        }),
      },
      adminToken,
    );
    expect(good.status).toBe(200);
  });

  it("rejects an unsigned delivery webhook", async () => {
    const res = await fetch(`${API}/sms/webhooks/africastalking`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "spoofed", status: "Success" }),
    });
    // No secret configured here, so the adapter fails closed.
    expect(res.status).toBe(403);
  });

  it("reports send statistics for the facility", async () => {
    const res = await api("/sms/stats");
    const stats = (await res.json()) as { byStatus: Record<string, number> };
    expect(stats.byStatus.skipped_no_consent).toBeGreaterThan(0);
  });
});

/**
 * Deployment accountability and the SMS kill switch.
 *
 * The switch is tested at the hub rather than by checking a button is hidden.
 * A disabled feature a stale client or a queued job can still reach is not
 * disabled, and reaching this one would mean a real message to a real patient
 * and a real bill.
 */
import { beforeAll, describe, expect, it } from "vitest";

const API = process.env.E2E_API_URL ?? "http://localhost:3100/api/v1";
const hubUp = process.env.PHC_HUB_UP === "1";
let nurse = "";
let admin = "";

async function api(path: string, init: RequestInit = {}, token = nurse) {
  return fetch(`${API}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
}

beforeAll(async () => {
  if (!hubUp) return;
  const login = async (u: string, p: string) => {
    const res = await fetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: u, pin: p, facility_id: "fac-0062", device_id: "dev-c" }),
    });
    return ((await res.json()) as { accessToken: string }).accessToken;
  };
  nurse = await login("nurse", "2222");
  admin = await login("admin", "5555");
}, 30_000);

describe.skipIf(!hubUp)("deployment accountability", () => {
  it("publishes the controller and DPO without requiring a login", async () => {
    // A data subject must be able to find out who holds their record.
    const res = await fetch(`${API}/system/compliance`);
    expect(res.ok).toBe(true);
    const body = (await res.json()) as {
      controller: string;
      dpo: { name: string };
      legal_basis: string;
    };
    expect(body.controller).toBeTruthy();
    expect(body.dpo.name).toBeTruthy();
    expect(body.legal_basis).toContain("Nigeria Data Protection Act");
  });

  it("carries no patient data", async () => {
    const body = (await (await fetch(`${API}/system/compliance`)).json()) as Record<string, unknown>;

    // Asserted on the shape, not on prose: the endpoint's own text mentions
    // "patient data" in describing residency, which a keyword scan would flag.
    expect(Object.keys(body).sort()).toEqual(
      ["controller", "dpo", "features", "legal_basis", "residency", "retention"].sort(),
    );

    const text = JSON.stringify(body);
    // No identifier, and nothing shaped like a phone number or an MRN.
    expect(text).not.toMatch(/\+234\d{6,}/);
    expect(text).not.toMatch(/NNW\d{4}-/);
    for (const field of ["phone_primary", "date_of_birth", "first_name", "mrn"]) {
      expect(text).not.toContain(field);
    }
  });

  it("states the retention periods and that they are not automatic deletion", async () => {
    const body = (await (await fetch(`${API}/system/compliance`)).json()) as {
      retention: { general_years: number; maternity_years: number; note: string };
    };
    expect(body.retention.general_years).toBeGreaterThan(0);
    // Maternity is held longest; obstetric claims have a long tail.
    expect(body.retention.maternity_years).toBeGreaterThan(body.retention.general_years);
    expect(body.retention.note).toContain("never hard-deleted");
  });

  it("reports data residency as Nigeria", async () => {
    const body = (await (await fetch(`${API}/system/compliance`)).json()) as {
      residency: { country: string };
    };
    expect(body.residency.country).toBe("Nigeria");
  });
});

describe.skipIf(!hubUp)("SMS kill switch", () => {
  it("reports SMS as switched off", async () => {
    const body = (await (await fetch(`${API}/system/compliance`)).json()) as {
      features: { sms_enabled: boolean };
    };
    expect(body.features.sms_enabled).toBe(false);
  });

  it("refuses a single send", async () => {
    const res = await api("/sms/send", {
      method: "POST",
      body: JSON.stringify({
        patient_id: "any",
        template_key: "anc_reminder",
        message_id: "11111111-1111-4111-8111-111111111111",
      }),
    });
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("SMS_DISABLED");
  });

  it("refuses a bulk send", async () => {
    const res = await api(
      "/sms/send-bulk",
      { method: "POST", body: JSON.stringify({ template_key: "anc_reminder", patient_ids: [] }) },
      admin,
    );
    expect(res.status).toBe(503);
  });

  it("refuses a send even to a privileged role", async () => {
    // The switch is about cost and consent, not permission, so no role gets past it.
    const res = await api(
      "/sms/send",
      {
        method: "POST",
        body: JSON.stringify({
          patient_id: "any",
          template_key: "anc_reminder",
          message_id: "22222222-2222-4222-8222-222222222222",
        }),
      },
      admin,
    );
    expect(res.status).toBe(503);
  });

  it("still serves templates and the send log, which cost nothing", async () => {
    // Left readable so a past send log stays auditable and the templates can be
    // reviewed before SMS is ever switched on.
    expect((await api("/sms/templates")).ok).toBe(true);
    expect((await api("/sms/messages", {}, admin)).ok).toBe(true);
  });
});

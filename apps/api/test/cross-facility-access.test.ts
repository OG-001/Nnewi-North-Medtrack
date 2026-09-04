/**
 * Cross-facility patient access (Global Constraint 8).
 *
 * The rule has two halves and both matter: care must not be blocked when a
 * patient travels, and staff must not get blanket access to every record in the
 * LGA. The audited, reason-prompted path is what reconciles them, so these
 * tests check that the audit event is actually written and that the index never
 * leaks clinical content.
 */
import { beforeAll, describe, expect, it } from "vitest";

const API = process.env.E2E_API_URL ?? "http://localhost:3100/api/v1";
const FACILITY_A = "fac-0062";
const FACILITY_B = "fac-0060";
const hubUp = process.env.PHC_HUB_UP === "1";

let nurseA = "";
let lga = "";
let adminA = "";
const RUN = Math.random().toString(16).slice(2, 10).padEnd(8, "0");
let seq = 0;
const nextId = () => `${RUN}-0000-4000-8000-${String(++seq).padStart(12, "0")}`;

const SURNAME = `Traveller${RUN.slice(0, 4)}`;
let patientAtB = "";

async function api(path: string, init: RequestInit = {}, token = nurseA) {
  return fetch(`${API}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
}

async function login(username: string, pin: string, facility: string) {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, pin, facility_id: facility, device_id: "dev-xfac" }),
  });
  return ((await res.json()) as { accessToken: string }).accessToken;
}

beforeAll(async () => {
  if (!hubUp) return;
  nurseA = await login("nurse", "2222", FACILITY_A);
  adminA = await login("admin", "5555", FACILITY_A);
  lga = await login("lga", "6666", FACILITY_A);

  // A patient registered at facility B, who then turns up at facility A.
  const nurseB = await login("nurse", "2222", FACILITY_B);
  await api("/sync/enroll", { method: "POST", body: JSON.stringify({ device_id: "dev-xfac-b" }) }, nurseB);
  patientAtB = nextId();
  await api(
    "/sync/push",
    {
      method: "POST",
      body: JSON.stringify({
        device_id: "dev-xfac-b",
        changes: [
          {
            entity_type: "patient",
            entity_id: patientAtB,
            op: "upsert",
            rev: 1,
            base_rev: 0,
            payload: {
              facility_id: FACILITY_B,
              first_name: "Ada",
              last_name: SURNAME,
              mrn: `MRN-${RUN}`,
              sex: "female",
              date_of_birth: "1994-03-02",
              phone_primary: "+2348030001111",
              // Clinical content that must never surface in the index.
              chronic_conditions: ["hypertension"],
              allergies: ["penicillin"],
            },
            client_ts: new Date().toISOString(),
          },
        ],
      }),
    },
    nurseB,
  );
}, 60_000);

describe.skipIf(!hubUp)("cross-facility patient access", () => {
  it("finds a patient from another facility in the LGA-wide index", async () => {
    const res = await api(`/patients/index?query=${SURNAME}`);
    expect(res.ok).toBe(true);
    const body = (await res.json()) as { results: Record<string, unknown>[] };
    const hit = body.results.find((r) => r.id === patientAtB);
    expect(hit).toBeDefined();
    expect(hit!.home_facility_id).toBe(FACILITY_B);
    // Flagged as outside this nurse's scope, so the UI knows to prompt.
    expect(hit!.in_scope).toBe(false);
  });

  it("exposes identity fields only, never clinical content", async () => {
    const res = await api(`/patients/index?query=${SURNAME}`);
    const body = (await res.json()) as { results: Record<string, unknown>[] };
    const hit = body.results.find((r) => r.id === patientAtB)!;

    expect(Object.keys(hit).sort()).toEqual(
      [
        "display_name",
        "home_facility_id",
        "home_facility_name",
        "id",
        "in_scope",
        "mrn",
        "sex",
        "year_of_birth",
      ].sort(),
    );
    // The whole payload must not leak through some other key.
    const serialised = JSON.stringify(hit);
    expect(serialised).not.toContain("hypertension");
    expect(serialised).not.toContain("penicillin");
    expect(serialised).not.toContain("+2348030001111");
    // Year only, not the full date of birth.
    expect(hit.year_of_birth).toBe(1994);
    expect(serialised).not.toContain("1994-03-02");
  });

  it("requires a minimum-length search, so the index cannot be enumerated", async () => {
    const res = await api("/patients/index?query=a");
    expect(res.status).toBe(400);
  });

  it("refuses to open another facility's record without a reason", async () => {
    const res = await api(`/patients/${patientAtB}/access`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("REASON_REQUIRED");
  });

  it("refuses a token reason", async () => {
    const res = await api(`/patients/${patientAtB}/access`, {
      method: "POST",
      body: JSON.stringify({ reason: "x" }),
    });
    expect(res.status).toBe(403);
  });

  it("opens the record with a reason, and audits it as sensitive_access", async () => {
    const reason = "Patient presented at this PHC in labour; needs her ANC history";
    const res = await api(`/patients/${patientAtB}/access`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
    expect(res.ok).toBe(true);
    const body = (await res.json()) as {
      patient: Record<string, unknown>;
      home_facility_id: string;
      cross_facility: boolean;
    };

    expect(body.cross_facility).toBe(true);
    // The home facility is preserved: the record is not moved by being read.
    expect(body.home_facility_id).toBe(FACILITY_B);
    expect(body.patient.last_name).toBe(SURNAME);

    const logRes = await api("/patients/sensitive-access-log", {}, lga);
    const log = (await logRes.json()) as {
      entityId: string;
      action: string;
      details: { reason?: string };
    }[];
    const entry = log.find((e) => e.entityId === patientAtB);
    expect(entry, "a sensitive_access event must exist for this open").toBeDefined();
    expect(entry!.action).toBe("sensitive_access");
    expect(entry!.details.reason).toBe(reason);
  });

  it("opens an in-scope record with no reason and no sensitive_access event", async () => {
    const ownPatient = nextId();
    await api("/sync/enroll", { method: "POST", body: JSON.stringify({ device_id: "dev-xfac" }) });
    await api("/sync/push", {
      method: "POST",
      body: JSON.stringify({
        device_id: "dev-xfac",
        changes: [
          {
            entity_type: "patient",
            entity_id: ownPatient,
            op: "upsert",
            rev: 1,
            base_rev: 0,
            payload: { facility_id: FACILITY_A, first_name: "Own", last_name: "Patient" },
            client_ts: new Date().toISOString(),
          },
        ],
      }),
    });

    const res = await api(`/patients/${ownPatient}/access`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    expect(res.ok).toBe(true);
    const body = (await res.json()) as { cross_facility: boolean };
    // Routine care at your own facility is not a sensitive access.
    expect(body.cross_facility).toBe(false);

    const logRes = await api("/patients/sensitive-access-log", {}, adminA);
    const log = (await logRes.json()) as { entityId: string }[];
    expect(log.find((e) => e.entityId === ownPatient)).toBeUndefined();
  });

  it("lets an LGA officer open any record without it counting as cross-facility", async () => {
    const res = await api(`/patients/${patientAtB}/access`, { method: "POST", body: "{}" }, lga);
    expect(res.ok).toBe(true);
    const body = (await res.json()) as { cross_facility: boolean };
    // LGA scope is genuinely LGA-wide; oversight is not an exception path.
    expect(body.cross_facility).toBe(false);
  });

  it("404s for a patient that does not exist", async () => {
    const res = await api(`/patients/${nextId()}/access`, {
      method: "POST",
      body: JSON.stringify({ reason: "Looking for a record that is not there" }),
    });
    expect(res.status).toBe(404);
  });

  it("restricts the sensitive-access log to privileged roles", async () => {
    const res = await api("/patients/sensitive-access-log", {}, nurseA);
    expect(res.status).toBe(403);
  });
});

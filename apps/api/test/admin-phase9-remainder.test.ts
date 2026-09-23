/**
 * The last three Phase 9 items: queue-station configuration, audit-log export,
 * and per-facility permission toggles.
 *
 * The toggle tests matter most. A facility may only ever WITHDRAW a permission,
 * and the withdrawal has to bite on the hub, not merely grey out a button.
 */
import { beforeAll, describe, expect, it } from "vitest";

const API = process.env.E2E_API_URL ?? "http://localhost:3100/api/v1";
const FACILITY_A = "fac-0062";
const hubUp = process.env.PHC_HUB_UP === "1";

let admin = "";
let systemAdmin = "";
let nurse = "";

async function api(path: string, init: RequestInit = {}, token = admin) {
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
    body: JSON.stringify({ username, pin, facility_id: FACILITY_A, device_id: "dev-p9" }),
  });
  return ((await res.json()) as { accessToken: string }).accessToken;
}

/** Restore an empty withdrawal set, so one test cannot strand the others. */
async function clearWithdrawals() {
  await api(
    "/config/facility_permissions",
    { method: "PUT", body: JSON.stringify({ value: { facilities: {} } }) },
    systemAdmin,
  );
}

beforeAll(async () => {
  if (!hubUp) return;
  admin = await login("admin", "5555");
  systemAdmin = await login("sysadmin", "0000");
  nurse = await login("nurse", "2222");
  await clearWithdrawals();
}, 30_000);

describe.skipIf(!hubUp)("queue station configuration", () => {
  it("serves the default stations", async () => {
    const res = await api("/config/queue_stations", {}, nurse);
    expect(res.ok).toBe(true);
    const body = (await res.json()) as {
      value: { stations: { key: string; active: boolean }[] };
    };
    expect(body.value.stations).toHaveLength(4);
    expect(body.value.stations.every((s) => s.active)).toBe(true);
  });

  it("lets an admin relabel and switch a station off", async () => {
    const res = await api("/config/queue_stations", {
      method: "PUT",
      body: JSON.stringify({
        value: {
          stations: [
            { key: "registration", label: "Front desk", order: 0, active: true },
            { key: "vitals", label: "Vitals", order: 1, active: true },
            { key: "consultation", label: "Consultation", order: 2, active: true },
            { key: "pharmacy", label: "Pharmacy", order: 3, active: false },
          ],
        },
      }),
    });
    expect(res.ok).toBe(true);

    const after = (await (await api("/config/queue_stations", {}, nurse)).json()) as {
      value: { stations: { key: string; label: string; active: boolean }[] };
    };
    const registration = after.value.stations.find((s) => s.key === "registration");
    expect(registration!.label).toBe("Front desk");
    expect(after.value.stations.find((s) => s.key === "pharmacy")!.active).toBe(false);
  });

  it("refuses dropping a station that queue rows may reference", async () => {
    const res = await api("/config/queue_stations", {
      method: "PUT",
      body: JSON.stringify({
        value: {
          stations: [
            { key: "registration", label: "Registration", order: 0, active: true },
            { key: "vitals", label: "Vitals", order: 1, active: true },
          ],
        },
      }),
    });
    expect(res.status).toBe(400);
  });
});

describe.skipIf(!hubUp)("audit log export", () => {
  it("exports CSV with a header and rows", async () => {
    const res = await api("/audit/export?limit=50");
    expect(res.ok).toBe(true);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toContain("attachment");

    const csv = await res.text();
    const [header, ...rows] = csv.split("\n");
    expect(header).toBe("at,actor_user_id,action,entity_type,entity_id,facility_id,device_id,details");
    expect(rows.length).toBeGreaterThan(0);
  });

  it("scopes the export to the administrator's own facility", async () => {
    const csv = await (await api("/audit/export")).text();
    const rows = csv.split("\n").slice(1).filter(Boolean);
    for (const row of rows) {
      // facility_id is the sixth column; a scoped viewer sees only their own.
      expect(row).toContain(FACILITY_A);
    }
  });

  it("records the export itself in the audit trail", async () => {
    await api("/audit/export?action=login");
    const log = (await (await api("/audit?action=audit_exported&limit=10")).json()) as {
      events: { action: string }[];
    };
    // Taking a copy of who did what out of the system is itself auditable.
    expect(log.events.length).toBeGreaterThan(0);
    expect(log.events[0].action).toBe("audit_exported");
  });

  it("refuses the export to a nurse", async () => {
    expect((await api("/audit/export", {}, nurse)).status).toBe(403);
  });
});

describe.skipIf(!hubUp)("per-facility permission toggles", () => {
  it("lets a system admin withdraw a permission at one facility", async () => {
    const res = await api(
      "/config/facility_permissions",
      {
        method: "PUT",
        body: JSON.stringify({
          value: { facilities: { [FACILITY_A]: { facility_admin: ["schedule.edit"] } } },
        }),
      },
      systemAdmin,
    );
    expect(res.ok).toBe(true);
  });

  it("the withdrawal bites on the hub, not only in the UI", async () => {
    // The facility administrator's role still grants schedule.edit; the
    // facility has switched it off, and the hub must refuse.
    const res = await api("/config/anc_model", {
      method: "PUT",
      body: JSON.stringify({
        value: { model: "who_2016_8", items: [{ contactNumber: 1, targetGaWeeks: 12, windowWeeks: 2 }] },
      }),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toContain("switched off");
  });

  it("does not affect a role the withdrawal did not name", async () => {
    // sysadmin is unaffected: the withdrawal named facility_admin only, and an
    // LGA-wide caller has no single facility for a withdrawal to apply to.
    const res = await api(
      "/config/queue_stations",
      {
        method: "PUT",
        body: JSON.stringify({ value: { stations: [
          { key: "registration", label: "Registration", order: 0, active: true },
          { key: "vitals", label: "Vitals", order: 1, active: true },
          { key: "consultation", label: "Consultation", order: 2, active: true },
          { key: "pharmacy", label: "Pharmacy", order: 3, active: true },
        ] } }),
      },
      systemAdmin,
    );
    expect(res.ok).toBe(true);
  });

  it("restores the permission when the withdrawal is removed", async () => {
    await clearWithdrawals();
    const res = await api("/config/anc_model", {
      method: "PUT",
      body: JSON.stringify({
        value: { model: "who_2016_8", items: [{ contactNumber: 1, targetGaWeeks: 12, windowWeeks: 2 }] },
      }),
    });
    expect(res.ok).toBe(true);
  });

  it("rejects a withdrawal naming an unknown permission", async () => {
    const res = await api(
      "/config/facility_permissions",
      {
        method: "PUT",
        body: JSON.stringify({
          value: { facilities: { [FACILITY_A]: { nurse_midwife: ["not_a_permission"] } } },
        }),
      },
      systemAdmin,
    );
    expect(res.status).toBe(400);
  });
});

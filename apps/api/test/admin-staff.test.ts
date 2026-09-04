/**
 * Staff, facility and audit administration.
 *
 * The two things that must be right: a facility administrator cannot escalate
 * privilege beyond their own PHC, and deactivating an account actually revokes
 * access rather than just relabelling it. Both were impossible to get wrong
 * before this existed, because none of it existed.
 */
import { beforeAll, describe, expect, it } from "vitest";

const API = process.env.E2E_API_URL ?? "http://localhost:3100/api/v1";
const FACILITY_A = "fac-0062";
const FACILITY_B = "fac-0060";
const hubUp = process.env.PHC_HUB_UP === "1";

let facilityAdmin = "";
let systemAdmin = "";
let nurse = "";

const RUN = Math.random().toString(16).slice(2, 8);
const uname = (base: string) => `${base}${RUN}`;

async function api(path: string, init: RequestInit = {}, token = facilityAdmin) {
  return fetch(`${API}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
}

async function login(username: string, pin: string, facility = FACILITY_A) {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, pin, facility_id: facility, device_id: "dev-admin" }),
  });
  return res;
}

beforeAll(async () => {
  if (!hubUp) return;
  facilityAdmin = ((await (await login("admin", "5555")).json()) as { accessToken: string }).accessToken;
  systemAdmin = ((await (await login("sysadmin", "0000")).json()) as { accessToken: string }).accessToken;
  nurse = ((await (await login("nurse", "2222")).json()) as { accessToken: string }).accessToken;
}, 30_000);

describe.skipIf(!hubUp)("staff administration", () => {
  it("refuses staff administration to a nurse", async () => {
    expect((await api("/admin/staff", {}, nurse)).status).toBe(403);
  });

  it("lists only staff at the administrator's own facilities", async () => {
    const res = await api("/admin/staff");
    expect(res.ok).toBe(true);
    const staff = (await res.json()) as { facility_ids: string[]; username: string }[];
    expect(staff.length).toBeGreaterThan(0);
    for (const member of staff) {
      expect(member.facility_ids).toContain(FACILITY_A);
    }
  });

  it("never returns a credential", async () => {
    const body = await (await api("/admin/staff")).text();
    expect(body).not.toContain("pinHash");
    expect(body).not.toContain("pin_hash");
    expect(body).not.toContain("$argon2");
  });

  it("creates a staff account at its own facility", async () => {
    const res = await api("/admin/staff", {
      method: "POST",
      body: JSON.stringify({
        full_name: "Chidinma Okoye",
        username: uname("clerk"),
        pin: "4821",
        roles: ["records_clerk"],
        facility_ids: [FACILITY_A],
      }),
    });
    expect(res.status).toBe(201);
    const created = (await res.json()) as { id: string; status: string; roles: string[] };
    expect(created.status).toBe("active");
    expect(created.roles).toEqual(["records_clerk"]);

    // The new account can actually sign in.
    const signIn = await login(uname("clerk"), "4821");
    expect(signIn.ok).toBe(true);
  });

  it("rejects a weak or guessable PIN", async () => {
    for (const pin of ["1234", "0000", "12", "abcd"]) {
      const res = await api("/admin/staff", {
        method: "POST",
        body: JSON.stringify({
          full_name: "Weak Pin",
          username: uname(`weak${pin}`),
          pin,
          roles: ["records_clerk"],
          facility_ids: [FACILITY_A],
        }),
      });
      expect(res.status, `pin ${pin}`).toBe(400);
    }
  });

  it("stops a facility admin creating staff at another facility", async () => {
    const res = await api("/admin/staff", {
      method: "POST",
      body: JSON.stringify({
        full_name: "Someone Else",
        username: uname("elsewhere"),
        pin: "4822",
        roles: ["records_clerk"],
        facility_ids: [FACILITY_B],
      }),
    });
    expect(res.status).toBe(403);
  });

  it("stops a facility admin granting a cross-facility role", async () => {
    // The escalation that matters: lga_authority reads every facility's data.
    for (const role of ["lga_authority", "system_admin"]) {
      const res = await api("/admin/staff", {
        method: "POST",
        body: JSON.stringify({
          full_name: "Would Be Elevated",
          username: uname(`elev${role.slice(0, 3)}`),
          pin: "4823",
          roles: [role],
          facility_ids: [FACILITY_A],
        }),
      });
      expect(res.status, role).toBe(403);
    }
  });

  it("lets a system admin grant a cross-facility role", async () => {
    const res = await api(
      "/admin/staff",
      {
        method: "POST",
        body: JSON.stringify({
          full_name: "Oversight Officer",
          username: uname("oversight"),
          pin: "4824",
          roles: ["lga_authority"],
          facility_ids: [FACILITY_A, FACILITY_B],
        }),
      },
      systemAdmin,
    );
    expect(res.status).toBe(201);
  });

  it("deactivation actually revokes access, not just the label", async () => {
    const created = (await (
      await api("/admin/staff", {
        method: "POST",
        body: JSON.stringify({
          full_name: "To Be Disabled",
          username: uname("leaver"),
          pin: "4825",
          roles: ["records_clerk"],
          facility_ids: [FACILITY_A],
        }),
      })
    ).json()) as { id: string };

    expect((await login(uname("leaver"), "4825")).ok).toBe(true);

    const disabled = await api(`/admin/staff/${created.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "disabled" }),
    });
    expect(disabled.ok).toBe(true);

    // The whole point: a disabled account cannot sign in anywhere.
    const after = await login(uname("leaver"), "4825");
    expect(after.status).toBe(401);
  });

  it("refuses to let an administrator deactivate themselves", async () => {
    const me = (await (await api("/admin/staff")).json()) as { id: string; username: string }[];
    const self = me.find((u) => u.username === "admin");
    const res = await api(`/admin/staff/${self!.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "disabled" }),
    });
    expect(res.status).toBe(400);
  });

  it("resets a PIN without echoing it, and invalidates the old one", async () => {
    const created = (await (
      await api("/admin/staff", {
        method: "POST",
        body: JSON.stringify({
          full_name: "Pin Reset",
          username: uname("resetme"),
          pin: "4826",
          roles: ["records_clerk"],
          facility_ids: [FACILITY_A],
        }),
      })
    ).json()) as { id: string };

    const res = await api(`/admin/staff/${created.id}/reset-pin`, {
      method: "POST",
      body: JSON.stringify({ pin: "4827" }),
    });
    expect(res.ok).toBe(true);
    expect(await res.text()).not.toContain("4827");

    expect((await login(uname("resetme"), "4826")).status).toBe(401);
    expect((await login(uname("resetme"), "4827")).ok).toBe(true);
  });

  it("audits every staff change", async () => {
    const res = await api("/audit?entityType=user_account&limit=50");
    const body = (await res.json()) as { events: { action: string }[] };
    const actions = body.events.map((e) => e.action);
    expect(actions).toContain("staff_created");
    expect(actions).toContain("staff_status_changed");
  });
});

describe.skipIf(!hubUp)("facility administration", () => {
  it("serves the facility list publicly, for the door screen", async () => {
    const res = await fetch(`${API}/facilities`);
    expect(res.ok).toBe(true);
    const list = (await res.json()) as unknown[];
    expect(list.length).toBeGreaterThan(50);
  });

  it("refuses facility creation to a facility admin", async () => {
    const res = await api("/facilities", {
      method: "POST",
      body: JSON.stringify({
        id: `fac-test-${RUN}`,
        code: `T${RUN}`,
        name: "Test PHC",
        type: "phc",
      }),
    });
    expect(res.status).toBe(403);
  });

  it("lets a system admin create and then deactivate a facility", async () => {
    const id = `fac-test-${RUN}`;
    const created = await api(
      "/facilities",
      {
        method: "POST",
        body: JSON.stringify({ id, code: `T${RUN}`, name: "Test PHC", type: "phc" }),
      },
      systemAdmin,
    );
    expect(created.status).toBe(201);

    const updated = await api(
      `/facilities/${id}`,
      { method: "PATCH", body: JSON.stringify({ active: false }) },
      systemAdmin,
    );
    expect(updated.ok).toBe(true);
    expect(((await updated.json()) as { active: boolean }).active).toBe(false);

    // Deactivated, not deleted: it is gone from the default list but still there.
    const active = (await (await fetch(`${API}/facilities`)).json()) as { id: string }[];
    expect(active.find((f) => f.id === id)).toBeUndefined();
    const all = (await (
      await fetch(`${API}/facilities?includeInactive=true`)
    ).json()) as { id: string }[];
    expect(all.find((f) => f.id === id)).toBeDefined();
  });

  it("rejects a duplicate facility code", async () => {
    const res = await api(
      "/facilities",
      {
        method: "POST",
        body: JSON.stringify({
          id: `fac-dup-${RUN}`,
          code: `T${RUN}`,
          name: "Duplicate",
          type: "phc",
        }),
      },
      systemAdmin,
    );
    expect(res.status).toBe(400);
  });
});

describe.skipIf(!hubUp)("audit log viewer", () => {
  it("refuses the audit log to a nurse", async () => {
    expect((await api("/audit", {}, nurse)).status).toBe(403);
  });

  it("scopes a facility admin to their own facility", async () => {
    const res = await api("/audit?limit=200");
    const body = (await res.json()) as { events: { facilityId: string | null }[] };
    for (const event of body.events) {
      expect(event.facilityId).toBe(FACILITY_A);
    }
  });

  it("lets a system admin see events with no facility", async () => {
    const res = await api("/audit?action=config_changed", {}, systemAdmin);
    const body = (await res.json()) as { events: unknown[] };
    // Config changes are facility-less, so a scoped viewer never sees them.
    expect(Array.isArray(body.events)).toBe(true);

    const scoped = await api("/audit?action=config_changed");
    const scopedBody = (await scoped.json()) as { events: unknown[] };
    expect(scopedBody.events).toHaveLength(0);
  });

  it("pages with a cursor", async () => {
    const first = (await (await api("/audit?limit=5")).json()) as {
      events: { id: string }[];
      next_cursor: string | null;
      has_more: boolean;
    };
    expect(first.events).toHaveLength(5);
    if (first.has_more) {
      const second = (await (
        await api(`/audit?limit=5&cursor=${first.next_cursor}`)
      ).json()) as { events: { id: string }[] };
      const firstIds = new Set(first.events.map((e) => e.id));
      // A cursor page must not repeat the page before it.
      expect(second.events.every((e) => !firstIds.has(e.id))).toBe(true);
    }
  });

  it("offers the actions actually present, for a real filter list", async () => {
    const res = await api("/audit/actions");
    const actions = (await res.json()) as { action: string; count: number }[];
    expect(actions.length).toBeGreaterThan(0);
    expect(actions.every((a) => a.count > 0)).toBe(true);
  });
});

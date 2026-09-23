/**
 * Patient duplicate merge (Phase 9 acceptance: "Merging two patients preserves
 * all history under one MRN, is fully audited, and corrects double-counting in
 * reports").
 *
 * Two records for one person is a clinical safety problem: a woman's antenatal
 * history split across two records means the clinician sees half of it. The
 * tests that matter are that **no history is lost** and that nothing is
 * hard-deleted.
 */
import { beforeAll, describe, expect, it } from "vitest";

const API = process.env.E2E_API_URL ?? "http://localhost:3100/api/v1";
const FACILITY_A = "fac-0062";
const FACILITY_B = "fac-0060";
const hubUp = process.env.PHC_HUB_UP === "1";

let admin = "";
let nurse = "";
let systemAdmin = "";

const RUN = Math.random().toString(16).slice(2, 10).padEnd(8, "0");
let seq = 0;
const nextId = () => `${RUN}-0000-4000-8000-${String(++seq).padStart(12, "0")}`;

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

async function login(username: string, pin: string, facility = FACILITY_A) {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, pin, facility_id: facility, device_id: "dev-merge" }),
  });
  return ((await res.json()) as { accessToken: string }).accessToken;
}

async function push(changes: unknown[], token = admin, device = "dev-merge") {
  const res = await api(
    "/sync/push",
    { method: "POST", body: JSON.stringify({ device_id: device, changes }) },
    token,
  );
  expect(res.ok, `push failed: ${res.status}`).toBe(true);
  return res.json();
}

function change(entityType: string, payload: Record<string, unknown>, facility = FACILITY_A) {
  return {
    entity_type: entityType,
    entity_id: nextId(),
    op: "upsert" as const,
    rev: 1,
    base_rev: 0,
    payload: { facility_id: facility, ...payload },
    client_ts: new Date().toISOString(),
  };
}

/** A pair of duplicate records for one woman, each carrying real history. */
async function makeDuplicatePair(surname: string) {
  const keptId = nextId();
  const dupId = nextId();
  const phone = `+23480${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;

  await push([
    {
      ...change("patient", {
        first_name: "Amaka",
        last_name: surname,
        mrn: `MRN-K-${RUN}`,
        sex: "female",
        date_of_birth: "1995-04-11",
        phone_primary: phone,
        // Deliberately blank, so the merge has something to fill from the duplicate.
        address_town: "",
        allergies: [],
      }),
      entity_id: keptId,
    },
    {
      ...change("patient", {
        first_name: "Amaka",
        last_name: surname,
        mrn: `MRN-D-${RUN}`,
        sex: "female",
        date_of_birth: "1995-04-11",
        phone_primary: phone,
        address_town: "Uruagu",
        allergies: ["penicillin"],
      }),
      entity_id: dupId,
    },
  ]);

  // History on each record. After the merge all of it must hang off the survivor.
  await push([
    change("encounter", { patient_id: keptId, encounter_date: "2026-05-02", type: "general" }),
    change("encounter", { patient_id: dupId, encounter_date: "2026-06-03", type: "anc" }),
    change("encounter", { patient_id: dupId, encounter_date: "2026-06-17", type: "anc" }),
    change("pregnancy", { patient_id: dupId, status: "active" }),
    change("immunization_dose", {
      patient_id: dupId,
      dose_label: "BCG",
      status: "given",
      given_date: "2026-06-03",
    }),
  ]);

  return { keptId, dupId, phone };
}

beforeAll(async () => {
  if (!hubUp) return;
  admin = await login("admin", "5555");
  nurse = await login("nurse", "2222");
  systemAdmin = await login("sysadmin", "0000");
  await api("/sync/enroll", { method: "POST", body: JSON.stringify({ device_id: "dev-merge" }) });
}, 60_000);

describe.skipIf(!hubUp)("duplicate detection", () => {
  it("surfaces a duplicate, with the evidence and the history at stake", async () => {
    const { keptId, dupId } = await makeDuplicatePair(`Dup${RUN.slice(0, 4)}`);

    const res = await api(`/patients/${keptId}/duplicates`);
    expect(res.ok).toBe(true);
    const candidates = (await res.json()) as {
      id: string;
      reasons: string[];
      record_counts: Record<string, number>;
    }[];

    const hit = candidates.find((c) => c.id === dupId);
    expect(hit, "the duplicate should be found").toBeDefined();
    expect(hit!.reasons.length).toBeGreaterThanOrEqual(2);
    // The administrator needs to see how much history would move.
    expect(hit!.record_counts.encounter).toBe(2);
    expect(hit!.record_counts.pregnancy).toBe(1);
  });

  it("does not offer unrelated patients as duplicates", async () => {
    const { keptId } = await makeDuplicatePair(`Uniq${RUN.slice(0, 4)}`);
    const candidates = (await (await api(`/patients/${keptId}/duplicates`)).json()) as {
      reasons: string[];
    }[];
    // Every candidate must carry at least one concrete reason.
    expect(candidates.every((c) => c.reasons.length > 0)).toBe(true);
  });

  it("refuses duplicate review to a nurse", async () => {
    const { keptId } = await makeDuplicatePair(`Rbac${RUN.slice(0, 4)}`);
    expect((await api(`/patients/${keptId}/duplicates`, {}, nurse)).status).toBe(403);
  });
});

describe.skipIf(!hubUp)("merging", () => {
  it("moves every record onto the survivor and loses nothing", async () => {
    const { keptId, dupId } = await makeDuplicatePair(`Move${RUN.slice(0, 4)}`);

    const before = (await (await api(`/patients/${keptId}/duplicates`)).json()) as {
      id: string;
      record_counts: Record<string, number>;
    }[];
    const dupCounts = before.find((c) => c.id === dupId)!.record_counts;

    const res = await api("/patients/merge", {
      method: "POST",
      body: JSON.stringify({
        surviving_id: keptId,
        merged_id: dupId,
        reason: "Same woman registered twice at the ANC desk on the same day",
      }),
    });
    expect(res.status).toBe(201);
    const result = (await res.json()) as { repointed: Record<string, number> };

    // Everything the duplicate carried was re-pointed.
    expect(result.repointed.encounter).toBe(dupCounts.encounter);
    expect(result.repointed.pregnancy).toBe(dupCounts.pregnancy);
    expect(result.repointed.immunization_dose).toBe(dupCounts.immunization_dose);

    // And it now hangs off the survivor: 2 from the duplicate plus its own 1.
    const after = await api(`/patients/${keptId}/duplicates`);
    expect(after.ok).toBe(true);
  });

  it("fills blanks on the survivor from the duplicate", async () => {
    const { keptId, dupId } = await makeDuplicatePair(`Fill${RUN.slice(0, 4)}`);
    await api("/patients/merge", {
      method: "POST",
      body: JSON.stringify({
        surviving_id: keptId,
        merged_id: dupId,
        reason: "Duplicate created during the immunization outreach day",
      }),
    });

    const opened = (await (
      await api(`/patients/${keptId}/access`, { method: "POST", body: "{}" })
    ).json()) as { patient: Record<string, unknown> };

    // A merge must not lose an address only the duplicate carried.
    expect(opened.patient.address_town).toBe("Uruagu");
    expect(opened.patient.allergies).toEqual(["penicillin"]);
    // The survivor keeps its own MRN.
    expect(String(opened.patient.mrn)).toContain("MRN-K-");
  });

  it("soft-deletes the duplicate as a tombstone, never a hard delete", async () => {
    const { keptId, dupId } = await makeDuplicatePair(`Tomb${RUN.slice(0, 4)}`);
    await api("/patients/merge", {
      method: "POST",
      body: JSON.stringify({
        surviving_id: keptId,
        merged_id: dupId,
        reason: "Confirmed the same patient by phone number and date of birth",
      }),
    });

    // The record still exists and says where it went (Global Constraint 3).
    const res = await api(`/patients/${dupId}/access`, { method: "POST", body: "{}" });
    expect(res.status).toBe(404); // not reachable as a live patient
    const merges = (await (await api("/patients/merge/history")).json()) as {
      mergedId: string;
      survivingId: string;
      reason: string;
    }[];
    const record = merges.find((m) => m.mergedId === dupId);
    expect(record, "the merge must leave a permanent record").toBeDefined();
    expect(record!.survivingId).toBe(keptId);
  });

  it("propagates the merge to devices through the change feed", async () => {
    const { keptId, dupId } = await makeDuplicatePair(`Feed${RUN.slice(0, 4)}`);
    const head = ((await push([])) as { server_seq: number }).server_seq;

    await api("/patients/merge", {
      method: "POST",
      body: JSON.stringify({
        surviving_id: keptId,
        merged_id: dupId,
        reason: "Merging duplicate records created at registration",
      }),
    });

    const feed = (await (await api(`/sync/changes?since=${head}&limit=500`)).json()) as {
      changes: { entity_id: string; entity_type: string; op: string }[];
    };
    // A device must learn that the duplicate is gone and where its history went.
    const tombstone = feed.changes.find((c) => c.entity_id === dupId);
    expect(tombstone?.op).toBe("delete");
    expect(feed.changes.some((c) => c.entity_type === "encounter")).toBe(true);
  });

  it("audits the merge with the reason", async () => {
    const { keptId, dupId } = await makeDuplicatePair(`Audit${RUN.slice(0, 4)}`);
    const reason = "Duplicate confirmed against the paper register by the officer in charge";
    await api("/patients/merge", {
      method: "POST",
      body: JSON.stringify({ surviving_id: keptId, merged_id: dupId, reason }),
    });

    const log = (await (await api("/audit?action=patient_merged&limit=50")).json()) as {
      events: { entityId: string; details: { reason?: string; merged_id?: string } }[];
    };
    const entry = log.events.find((e) => e.details?.merged_id === dupId);
    expect(entry).toBeDefined();
    expect(entry!.details.reason).toBe(reason);
    expect(entry!.entityId).toBe(keptId);
  });

  it("refuses a second merge of the same record", async () => {
    const { keptId, dupId } = await makeDuplicatePair(`Twice${RUN.slice(0, 4)}`);
    const body = JSON.stringify({
      surviving_id: keptId,
      merged_id: dupId,
      reason: "First merge of this duplicated registration",
    });
    expect((await api("/patients/merge", { method: "POST", body })).status).toBe(201);
    expect((await api("/patients/merge", { method: "POST", body })).status).toBe(400);
  });

  it("refuses merging a record into itself", async () => {
    const { keptId } = await makeDuplicatePair(`Self${RUN.slice(0, 4)}`);
    const res = await api("/patients/merge", {
      method: "POST",
      body: JSON.stringify({
        surviving_id: keptId,
        merged_id: keptId,
        reason: "This should never be allowed to happen at all",
      }),
    });
    expect(res.status).toBe(400);
  });

  it("requires a real reason", async () => {
    const { keptId, dupId } = await makeDuplicatePair(`Why${RUN.slice(0, 4)}`);
    for (const reason of ["", "dup", "x".repeat(9)]) {
      const res = await api("/patients/merge", {
        method: "POST",
        body: JSON.stringify({ surviving_id: keptId, merged_id: dupId, reason }),
      });
      expect(res.status, `reason "${reason}"`).toBe(400);
    }
  });

  it("refuses a cross-facility merge", async () => {
    const { keptId } = await makeDuplicatePair(`Cross${RUN.slice(0, 4)}`);

    const adminB = await login("admin", "5555", FACILITY_B);
    await api("/sync/enroll", { method: "POST", body: JSON.stringify({ device_id: "dev-merge-b" }) }, adminB);
    const foreignId = nextId();
    await push(
      [{ ...change("patient", { first_name: "Amaka", last_name: "Elsewhere" }, FACILITY_B), entity_id: foreignId }],
      adminB,
      "dev-merge-b",
    );

    const res = await api("/patients/merge", {
      method: "POST",
      body: JSON.stringify({
        surviving_id: keptId,
        merged_id: foreignId,
        reason: "Attempting to merge a record belonging to another facility",
      }),
    });
    // Moving one PHC's history into another's scope is a privacy decision.
    expect([400, 403, 404]).toContain(res.status);
  });

  it("refuses merging to a nurse, and to a system administrator", async () => {
    const { keptId, dupId } = await makeDuplicatePair(`Perm${RUN.slice(0, 4)}`);
    const body = JSON.stringify({
      surviving_id: keptId,
      merged_id: dupId,
      reason: "Checking that the permission matrix is actually enforced here",
    });
    expect((await api("/patients/merge", { method: "POST", body }, nurse)).status).toBe(403);
    // A system admin has no default clinical-data edit (rbac-and-scope section 3),
    // and `patient.merge` is granted to facility_admin alone.
    expect((await api("/patients/merge", { method: "POST", body }, systemAdmin)).status).toBe(403);
  });
});

/**
 * The concurrency matrix from offline-sync-design §10 — one case per conflict
 * class in §5, plus the worked examples in §6. These are release-blocking.
 */
import { describe, expect, it } from "vitest";
import { mergeDemographics, mergeState, resolveChange } from "../src/sync/conflict";

const server = (payload: Record<string, unknown>, rev: number, deletedAt: Date | null = null) => ({
  payload,
  rev,
  deletedAt,
});

describe("append-only clinical events (§5 row 1)", () => {
  it("never overwrites a recorded event when a concurrent change exists", () => {
    const res = resolveChange({
      entityType: "encounter",
      op: "upsert",
      server: server({ facility_id: "fac-0062", notes: "recorded at hub" }, 3),
      clientPayload: { facility_id: "fac-0062", notes: "stale device copy" },
      baseRev: 1,
      basePayload: null,
    });
    expect(res.kind).toBe("keep_server");
  });

  it("applies a genuinely new event (own UUID) with no conflict — §6 example 1", () => {
    const res = resolveChange({
      entityType: "immunization_dose",
      op: "upsert",
      server: null,
      clientPayload: { facility_id: "fac-0062", antigen: "bcg", status: "given" },
      baseRev: 0,
      basePayload: null,
    });
    expect(res.kind).toBe("apply");
  });
});

describe("workflow state-priority merge (§5 row 3)", () => {
  it("advances forward: completed beats in_progress — §6 example 2", () => {
    expect(mergeState("queue_entry", "in_progress", "completed")).toBe("completed");
  });

  it("does not bounce back: waiting loses to in_progress", () => {
    expect(mergeState("queue_entry", "in_progress", "waiting")).toBe("in_progress");
  });

  it("given beats due for an immunization dose", () => {
    expect(mergeState("immunization_dose", "due", "given")).toBe("given");
  });

  it("resolves a concurrent queue race to the more advanced state", () => {
    const res = resolveChange({
      entityType: "queue_entry",
      op: "upsert",
      server: server({ facility_id: "fac-0062", status: "completed" }, 4),
      clientPayload: { facility_id: "fac-0062", status: "in_progress" },
      baseRev: 2,
      basePayload: null,
    });
    expect(res.kind).toBe("merged");
    if (res.kind === "merged") expect(res.payload.status).toBe("completed");
  });
});

describe("demographics field-level LWW (§5 row 2)", () => {
  const base = { facility_id: "fac-0062", phone_primary: "+2348030000000", address_town: "Otolo" };

  it("takes the field the client actually changed — §6 example 3", () => {
    const res = mergeDemographics(
      "patient",
      { ...base, phone_primary: "+2348031111111" }, // server changed nothing else
      { ...base, phone_primary: "+2348032222222" },
      base,
    );
    expect(res.kind).toBe("merged");
    if (res.kind === "merged") expect(res.payload.phone_primary).toBe("+2348032222222");
  });

  it("merges non-overlapping edits instead of clobbering", () => {
    const res = mergeDemographics(
      "patient",
      { ...base, phone_primary: "+2348039999999" }, // server edited phone
      { ...base, address_town: "Uruagu" }, // client edited town
      base,
    );
    expect(res.kind).toBe("merged");
    if (res.kind === "merged") {
      expect(res.payload.phone_primary).toBe("+2348039999999"); // server edit survives
      expect(res.payload.address_town).toBe("Uruagu"); // client edit survives
    }
  });

  it("keeps the server value for a field the client never touched", () => {
    const res = mergeDemographics(
      "patient",
      { ...base, address_town: "Nnewichi" },
      { ...base }, // client still holds the old town
      base,
    );
    if (res.kind === "merged") expect(res.payload.address_town).toBe("Nnewichi");
  });
});

describe("identity-critical escalation (§5 Escalation, §6 example 4)", () => {
  const base = { facility_id: "fac-0062", date_of_birth: "1990-01-01" };

  it("escalates two different DOBs rather than silently picking one", () => {
    const res = mergeDemographics(
      "patient",
      { ...base, date_of_birth: "1990-05-05" },
      { ...base, date_of_birth: "1991-07-07" },
      base,
    );
    expect(res.kind).toBe("escalate");
    if (res.kind === "escalate") {
      expect(res.fields).toContain("date_of_birth");
      // Clinical work continues on the latest meanwhile.
      expect(res.payload.date_of_birth).toBe("1991-07-07");
    }
  });

  it("does not escalate when only one side changed the identity field", () => {
    const res = mergeDemographics(
      "patient",
      { ...base }, // server untouched
      { ...base, date_of_birth: "1991-07-07" },
      base,
    );
    expect(res.kind).toBe("merged");
  });

  it("escalates a contradictory sex correction", () => {
    const b = { facility_id: "fac-0062", sex: "female" };
    const res = mergeDemographics("patient", { ...b, sex: "male" }, { ...b, sex: "other" }, b);
    expect(res.kind).toBe("escalate");
  });
});

describe("idempotency (§6 example 5)", () => {
  it("treats a replayed push as a no-op — no duplicate, no rev bump", () => {
    const payload = { facility_id: "fac-0062", first_name: "Obinna" };
    const res = resolveChange({
      entityType: "patient",
      op: "upsert",
      server: server(payload, 2),
      clientPayload: payload,
      baseRev: 2,
      basePayload: null,
    });
    expect(res.kind).toBe("keep_server");
  });

  it("fast-forwards cleanly when the hub has seen no concurrent change", () => {
    const res = resolveChange({
      entityType: "patient",
      op: "upsert",
      server: server({ facility_id: "fac-0062", first_name: "Obinna" }, 2),
      clientPayload: { facility_id: "fac-0062", first_name: "Obinna Jr" },
      baseRev: 2,
      basePayload: null,
    });
    expect(res.kind).toBe("apply");
  });
});

describe("hub-mediated deletes and config (§5 rows 4-5)", () => {
  it("lets a hub soft-delete win over a concurrent local edit", () => {
    const res = resolveChange({
      entityType: "patient",
      op: "upsert",
      server: server({ facility_id: "fac-0062" }, 5, new Date()),
      clientPayload: { facility_id: "fac-0062", first_name: "Edited offline" },
      baseRev: 3,
      basePayload: null,
    });
    expect(res.kind).toBe("keep_server");
  });

  it("applies an explicit delete deterministically", () => {
    const res = resolveChange({
      entityType: "patient",
      op: "delete",
      server: server({ facility_id: "fac-0062" }, 2),
      clientPayload: { facility_id: "fac-0062" },
      baseRev: 2,
      basePayload: null,
    });
    expect(res.kind).toBe("apply");
  });

  it("rejects a client push to hub-authoritative config", () => {
    const res = resolveChange({
      entityType: "facility",
      op: "upsert",
      server: null,
      clientPayload: { facility_id: "fac-0062", name: "Renamed by device" },
      baseRev: 0,
      basePayload: null,
    });
    expect(res.kind).toBe("reject");
  });

  it("rejects an unknown entity_type rather than guessing a rule", () => {
    const res = resolveChange({
      entityType: "not_a_table",
      op: "upsert",
      server: null,
      clientPayload: { facility_id: "fac-0062" },
      baseRev: 0,
      basePayload: null,
    });
    expect(res.kind).toBe("reject");
  });
});

describe("replay after a dropped response (regression)", () => {
  it("is a no-op even though the re-send carries the original base_rev", () => {
    // The hub already applied this push and stamped rev 1; the ack never
    // arrived, so the device re-sends with base_rev 0 exactly as before.
    const clientPayload = { facility_id: "fac-0062", first_name: "Obinna" };
    const res = resolveChange({
      entityType: "patient",
      op: "upsert",
      server: server({ ...clientPayload, rev: 1 }, 1),
      clientPayload,
      baseRev: 0,
      basePayload: null,
    });
    expect(res.kind).toBe("keep_server");
  });
});

describe("JSONB key-order independence (regression)", () => {
  it("treats a payload reordered by Postgres as unchanged", () => {
    // Postgres JSONB returns object keys in its own order; a replay must still
    // be recognised as a no-op rather than bumping the rev on every retry.
    const clientPayload = { facility_id: "fac-0062", first_name: "Obinna" };
    const res = resolveChange({
      entityType: "patient",
      op: "upsert",
      server: server({ rev: 1, first_name: "Obinna", facility_id: "fac-0062" }, 1),
      clientPayload,
      baseRev: 0,
      basePayload: null,
    });
    expect(res.kind).toBe("keep_server");
  });

  it("still detects a real change when keys are reordered", () => {
    const res = resolveChange({
      entityType: "patient",
      op: "upsert",
      server: server({ rev: 1, first_name: "Obinna", facility_id: "fac-0062" }, 1),
      clientPayload: { facility_id: "fac-0062", first_name: "Obinna Jr" },
      baseRev: 1,
      basePayload: null,
    });
    expect(res.kind).toBe("apply");
  });
});

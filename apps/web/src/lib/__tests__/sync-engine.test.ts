/**
 * Durability edges of the client sync engine (offline-sync-design §8).
 *
 * These cover what the browser e2e cannot reach cleanly: an outbox left
 * `in_flight` by a crash, a watermark that must never move backwards, and the
 * scope purge that keeps out-of-scope patient data off a device.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "../../db/db";
import type { OutboxEntry } from "../../db/types";
import {
  applyChangeForTest,
  getMeta,
  purgeOutOfScope,
  recoverInFlight,
  setWatermark,
} from "../sync-engine";

async function resetStore() {
  await db.open();
  await Promise.all([
    db.outbox.clear(),
    db.syncMeta.clear(),
    db.patients.clear(),
    db.encounters.clear(),
  ]);
}

function outboxEntry(overrides: Partial<OutboxEntry> = {}): OutboxEntry {
  return {
    entity_type: "patients",
    entity_id: crypto.randomUUID(),
    op: "upsert",
    payload: { facility_id: "fac-0062" },
    rev: 1,
    created_at: new Date().toISOString(),
    status: "pending",
    ...overrides,
  };
}

describe("in-flight recovery after a crash", () => {
  beforeEach(resetStore);

  it("returns stranded in_flight entries to pending so they re-send", async () => {
    await db.outbox.bulkAdd([
      outboxEntry({ status: "in_flight" }),
      outboxEntry({ status: "in_flight" }),
      outboxEntry({ status: "pending" }),
    ]);

    const recovered = await recoverInFlight();

    expect(recovered).toBe(2);
    expect(await db.outbox.where("status").equals("pending").count()).toBe(3);
    expect(await db.outbox.where("status").equals("in_flight").count()).toBe(0);
  });

  it("leaves acknowledged work alone — recovery must not resurrect it", async () => {
    await db.outbox.bulkAdd([
      outboxEntry({ status: "acked" }),
      outboxEntry({ status: "conflict" }),
    ]);

    await recoverInFlight();

    expect(await db.outbox.where("status").equals("pending").count()).toBe(0);
    expect(await db.outbox.where("status").equals("acked").count()).toBe(1);
    // A rejected/poison change stays parked rather than blocking the outbox.
    expect(await db.outbox.where("status").equals("conflict").count()).toBe(1);
  });

  it("is safe to run repeatedly", async () => {
    await db.outbox.add(outboxEntry({ status: "in_flight" }));

    expect(await recoverInFlight()).toBe(1);
    expect(await recoverInFlight()).toBe(0);
    expect(await db.outbox.where("status").equals("pending").count()).toBe(1);
  });
});

describe("sync metadata", () => {
  beforeEach(resetStore);

  it("never moves the watermark backwards", async () => {
    await setWatermark(120);
    expect((await getMeta()).server_seq_watermark).toBe(120);

    // An out-of-order or stale response must not rewind the device: rewinding
    // would re-apply changes, and advancing past a gap would skip them.
    await setWatermark(90);
    expect((await getMeta()).server_seq_watermark).toBe(120);

    await setWatermark(200);
    expect((await getMeta()).server_seq_watermark).toBe(200);
  });

  it("creates a singleton meta row with a device id", async () => {
    const meta = await getMeta();
    expect(meta.server_seq_watermark).toBe(0);
    expect(meta.device_id).toBeTruthy();

    // Reading again must not mint a second row or a second device id.
    const again = await getMeta();
    expect(again.device_id).toBe(meta.device_id);
    expect(await db.syncMeta.count()).toBe(1);
  });
});

describe("scope purge", () => {
  beforeEach(resetStore);

  const patient = (id: string, facility: string) => ({
    id,
    facility_id: facility,
    mrn: `MRN-${id}`,
    home_facility_id: facility,
    first_name: "Test",
    last_name: "Patient",
    sex: "female",
    date_of_birth: null,
    dob_estimated: true,
    phone_primary: "+2348030000000",
    preferred_language: "en",
    sms_consent: false,
    status: "active",
    category_tags: [],
    allergies: [],
    chronic_conditions: [],
    created_at: new Date().toISOString(),
    created_by: "u-test",
    updated_at: new Date().toISOString(),
    updated_by: "u-test",
    rev: 1,
    deleted_at: null,
    origin_device_id: "dev-test",
  });

  it("removes rows outside the granted facility scope", async () => {
    await db.patients.bulkPut([
      patient("p-own-1", "fac-0062"),
      patient("p-own-2", "fac-0062"),
      patient("p-foreign", "fac-0060"),
    ] as never);

    const removed = await purgeOutOfScope(["fac-0062"]);

    expect(removed).toBe(1);
    expect(await db.patients.count()).toBe(2);
    expect(await db.patients.get("p-foreign")).toBeUndefined();
  });

  it("keeps everything for an LGA-wide scope", async () => {
    await db.patients.bulkPut([
      patient("p-a", "fac-0062"),
      patient("p-b", "fac-0060"),
    ] as never);

    // null scope means cross-facility oversight — nothing to purge.
    expect(await purgeOutOfScope(null)).toBe(0);
    expect(await db.patients.count()).toBe(2);
  });
});

describe("defensive application of hub rows (regression)", () => {
  beforeEach(resetStore);

  it("completes a row that arrives without its common columns", async () => {
    // A partial payload from another device once crashed the patient list,
    // because the list sorts on created_at. One bad row must not break a screen.
    await applyChangeForTest({
      entity_type: "patient",
      entity_id: "p-partial",
      op: "upsert",
      rev: 3,
      payload: { facility_id: "fac-0062", first_name: "Partial", last_name: "Row" },
    });

    const row = (await db.patients.get("p-partial")) as unknown as Record<string, unknown>;
    expect(row).toBeDefined();
    expect(typeof row.created_at).toBe("string");
    expect(typeof row.updated_at).toBe("string");
    expect(row.deleted_at).toBeNull();
    expect(row.rev).toBe(3);
    expect(row.facility_id).toBe("fac-0062");
  });

  it("keeps the existing timestamps when the hub omits them on an update", async () => {
    await applyChangeForTest({
      entity_type: "patient",
      entity_id: "p-keep",
      op: "upsert",
      rev: 1,
      payload: {
        facility_id: "fac-0062",
        first_name: "First",
        last_name: "Version",
        created_at: "2026-01-01T00:00:00.000Z",
      },
    });
    await applyChangeForTest({
      entity_type: "patient",
      entity_id: "p-keep",
      op: "upsert",
      rev: 2,
      payload: { facility_id: "fac-0062", first_name: "Second", last_name: "Version" },
    });

    const row = (await db.patients.get("p-keep")) as unknown as Record<string, unknown>;
    expect(row.created_at).toBe("2026-01-01T00:00:00.000Z");
    expect(row.first_name).toBe("Second");
  });

  it("ignores a delete for a row it does not hold", async () => {
    await applyChangeForTest({
      entity_type: "patient",
      entity_id: "p-absent",
      op: "delete",
      rev: 2,
      payload: { facility_id: "fac-0062" },
    });
    expect(await db.patients.get("p-absent")).toBeUndefined();
  });

  it("soft-deletes rather than removing a row", async () => {
    await applyChangeForTest({
      entity_type: "patient",
      entity_id: "p-del",
      op: "upsert",
      rev: 1,
      payload: { facility_id: "fac-0062", first_name: "To", last_name: "Delete" },
    });
    await applyChangeForTest({
      entity_type: "patient",
      entity_id: "p-del",
      op: "delete",
      rev: 2,
      payload: { facility_id: "fac-0062" },
    });

    const row = (await db.patients.get("p-del")) as unknown as Record<string, unknown>;
    // Clinical data is never hard-deleted (Global Constraint 3).
    expect(row).toBeDefined();
    expect(row.deleted_at).toBeTruthy();
  });
});

describe("list fields on applied rows (regression)", () => {
  beforeEach(resetStore);

  it("defaults the arrays the patient list iterates over", async () => {
    // A payload without category_tags crashed the Patients screen outright.
    await applyChangeForTest({
      entity_type: "patient",
      entity_id: "p-lists",
      op: "upsert",
      rev: 1,
      payload: { facility_id: "fac-0062", first_name: "No", last_name: "Arrays" },
    });

    const row = (await db.patients.get("p-lists")) as unknown as Record<string, unknown>;
    expect(row.category_tags).toEqual([]);
    expect(row.allergies).toEqual([]);
    expect(row.chronic_conditions).toEqual([]);
  });

  it("keeps arrays the hub did send", async () => {
    await applyChangeForTest({
      entity_type: "patient",
      entity_id: "p-lists-2",
      op: "upsert",
      rev: 1,
      payload: {
        facility_id: "fac-0062",
        first_name: "Has",
        last_name: "Arrays",
        allergies: ["penicillin"],
      },
    });

    const row = (await db.patients.get("p-lists-2")) as unknown as Record<string, unknown>;
    expect(row.allergies).toEqual(["penicillin"]);
    expect(row.category_tags).toEqual([]);
  });
});

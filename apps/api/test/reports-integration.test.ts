/**
 * Reporting against a live hub: generation from synced rows, drill-down, lock
 * immutability, adjustments, export, and the LGA rollup's scope rules
 * (phase 8, task 8).
 *
 * The arithmetic itself is covered in packages/shared/test/reporting.test.ts.
 * What is checked here is everything the database and the guards add.
 */
import { beforeAll, describe, expect, it } from "vitest";

const API = process.env.E2E_API_URL ?? "http://localhost:3100/api/v1";
const FACILITY = "fac-0062";
const OTHER_FACILITY = "fac-0060";
const hubUp = process.env.PHC_HUB_UP === "1";

let nurse = "";
let admin = "";
let lga = "";

// A month of its own per run, so runs cannot contaminate each other.
const YEAR = 2000 + Math.floor(Math.random() * 500);
const MONTH = 6;

const RUN = Math.random().toString(16).slice(2, 10).padEnd(8, "0");
let seq = 0;
const nextId = () => `${RUN}-0000-4000-8000-${String(++seq).padStart(12, "0")}`;
const dayIn = (day: number) =>
  `${YEAR}-06-${String(day).padStart(2, "0")}T09:00:00.000Z`;

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

async function login(username: string, pin: string, facility = FACILITY) {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, pin, facility_id: facility, device_id: "dev-reports" }),
  });
  return ((await res.json()) as { accessToken: string }).accessToken;
}

async function push(changes: unknown[], token = admin) {
  const res = await api(
    "/sync/push",
    { method: "POST", body: JSON.stringify({ device_id: "dev-reports", changes }) },
    token,
  );
  expect(res.ok).toBe(true);
  return res.json();
}

function change(entityType: string, payload: Record<string, unknown>, facility = FACILITY) {
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

const valueOf = (figures: { key: string; value: number }[], key: string) =>
  figures.find((f) => f.key === key)?.value;

beforeAll(async () => {
  if (!hubUp) return;
  admin = await login("admin", "5555");
  nurse = await login("nurse", "2222");
  lga = await login("lga", "6666");
  await api("/sync/enroll", {
    method: "POST",
    body: JSON.stringify({ device_id: "dev-reports", label: "reports tests" }),
  });

  // A small, hand-countable month: 3 patients, 2 deliveries (one still birth),
  // 4 Penta 1 and 3 Measles 1 doses.
  await push([
    change("patient", { first_name: "A", last_name: "One", status: "active" }),
    change("patient", { first_name: "B", last_name: "Two", status: "active" }),
    change("patient", { first_name: "C", last_name: "Three", status: "active" }),
    change("delivery", { delivery_date: dayIn(4), outcome: "live_birth", patient_id: "x" }),
    change("delivery", { delivery_date: dayIn(5), outcome: "still_birth", patient_id: "y" }),
    ...["c1", "c2", "c3", "c4"].map((child, i) =>
      change("immunization_dose", {
        patient_id: child,
        dose_label: "Penta 1",
        status: "given",
        given_date: dayIn(6 + i),
      }),
    ),
    ...["c1", "c2", "c3"].map((child, i) =>
      change("immunization_dose", {
        patient_id: child,
        dose_label: "Measles 1 (MCV1)",
        status: "given",
        given_date: dayIn(12 + i),
      }),
    ),
  ]);
}, 60_000);

describe.skipIf(!hubUp)("reporting against a live hub", () => {
  async function generate(token = admin, facility = FACILITY) {
    const res = await api(
      `/reports/monthly/generate?facility=${facility}&year=${YEAR}&month=${MONTH}`,
      {},
      token,
    );
    return res;
  }

  it("computes the month from synced source rows", async () => {
    const res = await generate();
    expect(res.ok).toBe(true);
    const report = (await res.json()) as {
      id: string;
      status: string;
      figures: { key: string; value: number }[];
    };

    expect(report.status).toBe("draft");
    expect(valueOf(report.figures, "deliveries")).toBe(2);
    expect(valueOf(report.figures, "live_births")).toBe(1);
    expect(valueOf(report.figures, "still_births")).toBe(1);
    expect(valueOf(report.figures, "imm_penta1")).toBe(4);
    expect(valueOf(report.figures, "imm_measles1")).toBe(3);
    // (4 - 3) / 4
    expect(valueOf(report.figures, "penta1_measles1_dropout_pct")).toBe(25);
  });

  it("counts only this facility's rows", async () => {
    // A delivery at the other PHC must not reach this facility's report.
    const otherAdmin = await login("admin", "5555", OTHER_FACILITY);
    await api(
      "/sync/enroll",
      { method: "POST", body: JSON.stringify({ device_id: "dev-reports-b" }) },
      otherAdmin,
    );
    await fetch(`${API}/sync/push`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${otherAdmin}` },
      body: JSON.stringify({
        device_id: "dev-reports-b",
        changes: [
          change("delivery", { delivery_date: dayIn(7), outcome: "live_birth", patient_id: "z" }, OTHER_FACILITY),
        ],
      }),
    });

    const report = (await (await generate()).json()) as { figures: { key: string; value: number }[] };
    expect(valueOf(report.figures, "deliveries")).toBe(2); // unchanged
  });

  it("refuses to generate a report for a facility outside scope", async () => {
    const res = await generate(nurse, OTHER_FACILITY);
    expect(res.status).toBe(403);
  });

  it("drills down from a figure to the rows behind it", async () => {
    const report = (await (await generate()).json()) as { id: string };
    const res = await api(`/reports/monthly/${report.id}/figures/deliveries`);
    const detail = (await res.json()) as {
      figure: { value: number };
      rows: { entityType: string }[];
    };
    expect(detail.figure.value).toBe(2);
    expect(detail.rows).toHaveLength(2);
    expect(detail.rows.every((r) => r.entityType === "delivery")).toBe(true);
  });

  it("points a percentage at the figures it derives from, not at rows", async () => {
    const report = (await (await generate()).json()) as { id: string };
    const res = await api(`/reports/monthly/${report.id}/figures/penta1_measles1_dropout_pct`);
    const detail = (await res.json()) as { derivedFrom: string[]; rows: unknown[] };
    expect(detail.derivedFrom).toEqual(["imm_penta1", "imm_measles1"]);
    expect(detail.rows).toEqual([]);
  });

  it("refuses a lock from a nurse", async () => {
    const report = (await (await generate()).json()) as { id: string };
    const res = await api(`/reports/monthly/${report.id}/lock`, { method: "POST" }, nurse);
    expect(res.status).toBe(403);
  });

  it("locks the report, freezes the figures, and refuses a second lock", async () => {
    const report = (await (await generate()).json()) as {
      id: string;
      figures: { key: string; value: number }[];
    };
    const before = valueOf(report.figures, "deliveries");

    const locked = await api(`/reports/monthly/${report.id}/lock`, { method: "POST" });
    expect(locked.status).toBe(201);
    expect(((await locked.json()) as { status: string }).status).toBe("locked");

    // A late-syncing delivery must not silently change a submitted return.
    await push([change("delivery", { delivery_date: dayIn(9), outcome: "live_birth", patient_id: "late" })]);
    const after = (await (await generate()).json()) as {
      status: string;
      figures: { key: string; value: number }[];
    };
    expect(after.status).toBe("locked");
    expect(valueOf(after.figures, "deliveries")).toBe(before);

    const second = await api(`/reports/monthly/${report.id}/lock`, { method: "POST" });
    expect(second.status).toBe(400);
  });

  it("records a correction as an adjustment instead of rewriting the figure", async () => {
    const report = (await (await generate()).json()) as {
      id: string;
      figures: { key: string; value: number }[];
    };
    const original = valueOf(report.figures, "deliveries");

    const res = await api(`/reports/monthly/${report.id}/adjustments`, {
      method: "POST",
      body: JSON.stringify({
        figure_key: "deliveries",
        to_value: 3,
        reason: "One delivery recorded on paper was missed during the outage",
      }),
    });
    expect(res.status).toBe(201);
    const adjustment = (await res.json()) as { fromValue: number; toValue: number };
    expect(adjustment.fromValue).toBe(original);
    expect(adjustment.toValue).toBe(3);

    // The locked figure itself is untouched: the submitted number stays visible.
    const after = (await (await generate()).json()) as { figures: { key: string; value: number }[] };
    expect(valueOf(after.figures, "deliveries")).toBe(original);
  });

  it("exports CSV with the adjusted value applied", async () => {
    const report = (await (await generate()).json()) as { id: string };
    const res = await api(`/reports/monthly/${report.id}/export?format=csv`);
    expect(res.ok).toBe(true);
    const csv = await res.text();
    expect(csv).toContain("Group,Data element,Key,Value");
    expect(csv).toContain("deliveries,3");
  });

  it("exports a DHIS2 dataValueSet and names unmapped elements", async () => {
    const report = (await (await generate()).json()) as { id: string };
    const res = await api(`/reports/monthly/${report.id}/export?format=dhis2`);
    const payload = (await res.json()) as {
      period: string;
      orgUnit: string;
      dataValues: unknown[];
      _unmappedElements?: string[];
    };
    expect(payload.period).toBe(`${YEAR}0${MONTH}`);
    expect(payload.dataValues.length).toBeGreaterThan(10);
    // No LGA mapping is configured here, so every element is reported unmapped.
    expect(payload._unmappedElements?.length).toBeGreaterThan(0);
  });

  it("rejects an unknown export format", async () => {
    const report = (await (await generate()).json()) as { id: string };
    const res = await api(`/reports/monthly/${report.id}/export?format=pdf`);
    expect(res.status).toBe(400);
  });

  it("refuses an LGA rollup to a facility-scoped user", async () => {
    const res = await api(`/reports/lga?year=${YEAR}&month=${MONTH}`, {}, admin);
    expect(res.status).toBe(403);
  });

  it("rolls up locked reports for an LGA user and reports its coverage", async () => {
    const res = await api(`/reports/lga?year=${YEAR}&month=${MONTH}`, {}, lga);
    expect(res.ok).toBe(true);
    const rollup = (await res.json()) as {
      figures: { key: string; value: number }[];
      facilitiesIncluded: number;
      facilitiesTotal: number;
    };
    expect(rollup.facilitiesIncluded).toBeGreaterThanOrEqual(1);
    // Coverage is stated, so a rollup over few facilities is not mistaken for
    // the whole LGA.
    expect(rollup.facilitiesTotal).toBeGreaterThan(rollup.facilitiesIncluded);
    expect(valueOf(rollup.figures, "imm_penta1")).toBeGreaterThanOrEqual(4);
  });

  it("excludes draft reports from the LGA rollup", async () => {
    // A month nobody has locked rolls up to nothing.
    const res = await api(`/reports/lga?year=${YEAR}&month=11`, {}, lga);
    const rollup = (await res.json()) as { facilitiesIncluded: number };
    expect(rollup.facilitiesIncluded).toBe(0);
  });
});

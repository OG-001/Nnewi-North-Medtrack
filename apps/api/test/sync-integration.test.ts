/**
 * The §10 matrix items that need a live hub: **resumability** of an interrupted
 * pull, idempotency of a re-sent push, poison-change isolation, and
 * **volume/perf** of the baseline snapshot.
 *
 * Requires a running hub + Postgres (see test/e2e-sync.sh for setup). Each test
 * skips itself at runtime when no hub answers, so `pnpm test` stays runnable
 * with no infrastructure.
 *
 * The tests share a long-lived database, so every assertion is made **relative
 * to the feed head measured at the start of that test** rather than to absolute
 * counts — otherwise they would pass once and fail on the second run.
 */
import { beforeAll, describe, expect, it } from "vitest";

const API = process.env.E2E_API_URL ?? "http://localhost:3100/api/v1";
const DEVICE = "dev-integration";
const FACILITY = "fac-0062";

let token = "";
/** Set by test/global-setup.ts, which probes the hub before collection. */
const hubUp = process.env.PHC_HUB_UP === "1";

/** Unique per run so repeated runs never collide on entity ids. */
const RUN = Math.random().toString(16).slice(2, 10).padEnd(8, "0");
let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `${RUN}-0000-4000-8000-${String(idCounter).padStart(12, "0")}`;
}

async function api(path: string, init: RequestInit = {}) {
  return fetch(`${API}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
}

interface ChangeRow {
  entity_id: string;
  server_seq: number;
}
interface ChangesBody {
  changes: ChangeRow[];
  next_seq: number;
  has_more: boolean;
}

async function push(changes: unknown[]) {
  const res = await api("/sync/push", {
    method: "POST",
    body: JSON.stringify({ device_id: DEVICE, changes }),
  });
  expect(res.ok).toBe(true);
  return (await res.json()) as {
    results: { entity_id: string; status: string }[];
    server_seq: number;
  };
}

/** Walk the feed to its end and return the head watermark. */
async function head(): Promise<number> {
  let since = 0;
  for (;;) {
    const res = await api(`/sync/changes?since=${since}&limit=500`);
    expect(res.ok, `GET /sync/changes returned ${res.status}`).toBe(true);
    const body = (await res.json()) as ChangesBody;
    since = body.next_seq;
    if (!body.has_more) return since;
  }
}

/** Drain the feed from `since`, `pageSize` at a time, resuming from next_seq. */
async function drainFrom(since: number, pageSize: number): Promise<ChangeRow[]> {
  const collected: ChangeRow[] = [];
  let cursor = since;
  let pages = 0;
  for (;;) {
    pages += 1;
    expect(pages).toBeLessThan(5_000); // never spin forever on a bad watermark
    const res = await api(`/sync/changes?since=${cursor}&limit=${pageSize}`);
    // Surface the real reason. A 429 here means the hub's rate limit is lower
    // than the suite needs, which is a test-environment problem, not a sync bug.
    expect(res.ok, `GET /sync/changes returned ${res.status}: ${await res.clone().text()}`).toBe(
      true,
    );
    const body = (await res.json()) as ChangesBody;
    collected.push(...body.changes);
    expect(body.next_seq).toBeGreaterThanOrEqual(cursor);
    cursor = body.next_seq;
    if (!body.has_more) return collected;
  }
}

function patientChange(id: string, firstName: string) {
  return {
    entity_type: "patient",
    entity_id: id,
    op: "upsert" as const,
    rev: 1,
    base_rev: 0,
    payload: { facility_id: FACILITY, first_name: firstName, last_name: "Integration" },
    client_ts: new Date().toISOString(),
  };
}

beforeAll(async () => {
  if (!hubUp) return;

  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      username: "nurse",
      pin: "2222",
      facility_id: FACILITY,
      device_id: DEVICE,
    }),
  });
  token = ((await res.json()) as { accessToken: string }).accessToken;
  await api("/sync/enroll", {
    method: "POST",
    body: JSON.stringify({ device_id: DEVICE, label: "integration" }),
  });
}, 30_000);

describe.skipIf(!hubUp)("sync protocol against a live hub", () => {
  it(
    "resumes an interrupted pull with no gaps and no duplicates",
    async () => {
      const start = await head();
      const ids = Array.from({ length: 60 }, () => nextId());
      await push(ids.map((id, i) => patientChange(id, `Resume${i}`)));

      // Tiny pages mean many resume points: the client only ever continues from
      // the watermark it has already committed.
      const seen = await drainFrom(start, 7);
      const ours = seen.map((c) => c.entity_id).filter((id) => ids.includes(id));

      expect(new Set(ours).size).toBe(ids.length); // nothing missing
      expect(ours.length).toBe(ids.length); // nothing duplicated
    },
    120_000,
  );

  it(
    "re-sending an unacknowledged batch creates no duplicates",
    async () => {
      const ids = Array.from({ length: 25 }, () => nextId());
      const batch = ids.map((id, i) => patientChange(id, `Retry${i}`));

      await push(batch);
      const afterFirst = await head();

      // The device never saw the ack, so it sends the identical batch again.
      const replay = await push(batch);
      const afterReplay = await head();

      expect(replay.results.every((r) => r.status !== "rejected")).toBe(true);
      // No new change-log entries: the replay was absorbed as a no-op.
      expect(afterReplay).toBe(afterFirst);
    },
    120_000,
  );

  it(
    "a poison change is parked without blocking the rest of the batch",
    async () => {
      const good = Array.from({ length: 10 }, () => nextId()).map((id, i) =>
        patientChange(id, `Good${i}`),
      );
      const poison = {
        ...patientChange(nextId(), "Poison"),
        payload: { facility_id: "fac-0060", first_name: "Foreign" }, // out of scope
      };

      const { results } = await push([...good.slice(0, 5), poison, ...good.slice(5)]);

      expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
      expect(results.filter((r) => r.status === "applied")).toHaveLength(good.length);
    },
    120_000,
  );

  it(
    "server_seq is strictly increasing across the feed",
    async () => {
      const rows = await drainFrom(0, 500);
      const seqs = rows.map((c) => c.server_seq);
      for (let i = 1; i < seqs.length; i += 1) {
        // Ordering is the hub's, never a device clock (§8).
        expect(seqs[i]).toBeGreaterThan(seqs[i - 1]);
      }
    },
    120_000,
  );

  it(
    "pages a facility-sized baseline within the device budget",
    async () => {
      // Roughly a real PHC's active roster.
      const ids = Array.from({ length: 500 }, () => nextId());
      for (let i = 0; i < ids.length; i += 250) {
        await push(ids.slice(i, i + 250).map((id, j) => patientChange(id, `Vol${i + j}`)));
      }

      const started = Date.now();
      let cursor: string | null = null;
      let rows = 0;
      let pages = 0;
      let slowestPage = 0;

      for (;;) {
        const pageStart = Date.now();
        const res = await api(
          `/sync/baseline?limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
        );
        const body = (await res.json()) as {
          changes: unknown[];
          cursor: string | null;
          has_more: boolean;
        };
        slowestPage = Math.max(slowestPage, Date.now() - pageStart);
        rows += body.changes.length;
        pages += 1;
        cursor = body.cursor;
        if (!body.has_more) break;
        expect(pages).toBeLessThan(500);
      }

      console.log(
        `baseline: ${rows} rows in ${pages} pages, ${Date.now() - started}ms total, ` +
          `slowest page ${slowestPage}ms`,
      );

      expect(rows).toBeGreaterThanOrEqual(ids.length);
      // A generous ceiling — this catches an O(n²) regression, not a slow laptop.
      expect(slowestPage).toBeLessThan(2_000);
    },
    180_000,
  );

  it(
    "an up-to-date device pulls nothing and returns fast",
    async () => {
      const current = await head();

      const started = Date.now();
      const res = await api(`/sync/changes?since=${current}&limit=500`);
      const idle = (await res.json()) as ChangesBody;
      const elapsed = Date.now() - started;

      // Steady state is the common case on a clinic device; it must be cheap.
      expect(idle.changes.length).toBe(0);
      expect(idle.has_more).toBe(false);
      expect(elapsed).toBeLessThan(1_000);
    },
    120_000,
  );
});

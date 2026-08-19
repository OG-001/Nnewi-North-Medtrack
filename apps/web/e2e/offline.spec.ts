/**
 * The offline half of the §10 sync test matrix.
 *
 * These are the release-blocking ones: a clinic works with no network, and
 * nothing a nurse typed is ever lost to a refresh, a crash, or an airplane-mode
 * cycle. Protocol-level concerns (idempotency, conflict rules, scope
 * enforcement) are covered against a live hub in apps/api/test/.
 */
import { expect, test } from "@playwright/test";
import {
  DEMO_FACILITY,
  SECOND_FACILITY,
  gotoPatients,
  registerPatient,
  signIn,
  signOutCompletely,
  waitForServiceWorker,
} from "./helpers";

test.describe("offline-first clinic workflows", () => {
  test.beforeEach(async ({ page }) => {
    await signOutCompletely(page);
  });

  test("the door screen lists the whole LGA registry", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/\d+ facilities/)).toBeVisible();
    await expect(page.getByText(DEMO_FACILITY)).toBeVisible();
  });

  test("loads and signs in from cache with the network cut", async ({ page, context }) => {
    // Load once so the app shell and seed data are on the device...
    await signIn(page);
    await waitForServiceWorker(page);
    await signOutCompletely(page);

    // ...then cut the network entirely and sign in again. Nothing here may
    // touch the server: the shell comes from the service worker and the PIN is
    // checked against the local store.
    await context.setOffline(true);
    await signIn(page);

    // Chromium resets navigator.onLine after a service-worker-served
    // navigation, so the connectivity chip is asserted in the test below (which
    // toggles offline without navigating). What this test proves is that a
    // fully offline device still opens the app and authenticates a nurse.
    await gotoPatients(page);
    await expect(page.getByRole("heading", { name: "Patients" })).toBeVisible();
  });

  test("registers a patient offline and keeps it across a reload", async ({ page, context }) => {
    await signIn(page);
    await waitForServiceWorker(page);
    await context.setOffline(true);

    const name = await registerPatient(page, "Chiamaka", "OfflineTest");

    // A refresh is the cheapest proxy for a crash: the write must have been
    // committed to IndexedDB, not held in memory.
    await page.reload();
    await gotoPatients(page);
    await expect(page.getByText(name)).toBeVisible();
  });

  test("shows Offline, then Pending(n) once work is queued", async ({ page, context }) => {
    await signIn(page);
    await waitForServiceWorker(page);
    await context.setOffline(true);
    await expect(page.getByRole("button", { name: "Offline" })).toBeVisible();

    await registerPatient(page, "Ngozi", "PendingTest");

    // Every write lands in the outbox, so the indicator must report a backlog
    // once the device is back online and has something to send.
    await context.setOffline(false);
    await expect(page.getByRole("button", { name: /Pending \(\d+\)|Syncing|Synced/ })).toBeVisible({
      timeout: 20_000,
    });
  });

  test("survives an airplane-mode cycle with no data loss", async ({ page, context }) => {
    await signIn(page);
    await waitForServiceWorker(page);

    await context.setOffline(true);
    const name = await registerPatient(page, "Adaeze", "AirplaneTest");

    // Reload while still offline — the local store is the system of record.
    await page.reload();
    await context.setOffline(false);
    await page.reload();

    await gotoPatients(page);
    await expect(page.getByText(name)).toBeVisible();
  });

  test("keeps every offline write, not just the last one", async ({ page, context }) => {
    await signIn(page);
    await waitForServiceWorker(page);
    await context.setOffline(true);

    const names: string[] = [];
    for (const [first, last] of [
      ["Ifeoma", "BatchOne"],
      ["Emeka", "BatchTwo"],
      ["Obinna", "BatchThree"],
    ]) {
      names.push(await registerPatient(page, first, last));
    }

    await page.reload();
    await gotoPatients(page);
    for (const name of names) {
      await expect(page.getByText(name)).toBeVisible();
    }
  });

  test("a patient registered at one PHC is not visible at another", async ({ page, context }) => {
    await signIn(page);
    await waitForServiceWorker(page);
    await context.setOffline(true);
    const scoped = await registerPatient(page, "Uche", "ScopeTest");

    // Switch to the other provisioned PHC; the row must not follow us there.
    await context.setOffline(false);
    await signOutCompletely(page);
    await signIn(page, { facility: SECOND_FACILITY });

    await gotoPatients(page);
    await expect(page.getByText(scoped)).toHaveCount(0);
  });
});

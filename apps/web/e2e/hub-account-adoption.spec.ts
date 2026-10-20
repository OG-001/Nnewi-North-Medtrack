/**
 * First contact: signing in with an account that exists on the hub but has
 * never been on this device.
 *
 * WHY THIS MATTERS. Local PIN auth is the source of truth for getting into the
 * app, which is what makes the offline guarantee real. But staff accounts reach
 * a device only by syncing down, syncing needs an enrolled device, and
 * enrolment used to be attempted only *after* a successful local sign-in. A
 * freshly installed device could therefore sign in only with an account already
 * in its local store, which in practice meant one the demo seed had planted. A
 * real deployment had no way in at all.
 *
 * These tests need a live hub holding an account the browser does not have, so
 * they skip when no hub answers. See e2e-sync.sh for setting one up.
 */
import { test, expect } from "@playwright/test";
import { DEMO_FACILITY, signOutCompletely } from "./helpers";

const API = process.env.E2E_API_URL ?? "http://localhost:3100/api/v1";

/**
 * A hub-only account, provisioned by this spec rather than by hand.
 *
 * It must never appear in the client-side seed, or the tests would pass without
 * adoption ever happening. The PIN is six digits because that is what the staff
 * PIN rule allows; see packages/shared/src/pin.ts.
 */
const HUB_ONLY_USERNAME = process.env.E2E_HUB_USERNAME ?? "adopt.test";
const HUB_ONLY_PIN = process.env.E2E_HUB_PIN ?? "730194";

/** A seeded administrator, used only to create the fixture above. */
const ADMIN_USERNAME = process.env.E2E_ADMIN_USERNAME ?? "sysadmin";
const ADMIN_PIN = process.env.E2E_ADMIN_PIN ?? "0000";
const FACILITY_ID = process.env.E2E_FACILITY_ID ?? "fac-0062";

let hubUp = false;

/** Sign in to the hub directly, outside the browser. */
async function hubToken(username: string, pin: string): Promise<string | null> {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, pin, facility_id: FACILITY_ID }),
  });
  if (!res.ok) return null;
  return ((await res.json()) as { accessToken?: string }).accessToken ?? null;
}

test.beforeAll(async () => {
  try {
    hubUp = (await fetch(`${API}/system/health`)).ok;
  } catch {
    hubUp = false;
  }
  if (!hubUp) {
    console.warn(`\nNo hub at ${API} — hub-adoption tests skipped.\n`);
    return;
  }

  // Provision the fixture so the suite does not depend on an account somebody
  // created by hand, which is exactly how it broke the first time.
  const admin = await hubToken(ADMIN_USERNAME, ADMIN_PIN);
  if (admin) {
    await fetch(`${API}/admin/staff`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${admin}` },
      body: JSON.stringify({
        username: HUB_ONLY_USERNAME,
        full_name: "Adopt Test",
        pin: HUB_ONLY_PIN,
        roles: ["nurse_midwife"],
        facility_ids: [FACILITY_ID],
      }),
      // A duplicate from a previous run is fine; the check below is what counts.
    }).catch(() => undefined);
  }

  // The fixture has to be usable, whether it was just created or already there.
  // Without this the adoption tests would fail for a reason unrelated to
  // adoption, which is what happened before.
  if (!(await hubToken(HUB_ONLY_USERNAME, HUB_ONLY_PIN))) {
    hubUp = false;
    console.warn(
      `\nHub at ${API} has no usable "${HUB_ONLY_USERNAME}" account and it could ` +
        `not be created (admin "${ADMIN_USERNAME}" unavailable) — tests skipped.\n`,
    );
  }
});

/**
 * Start each test as a signed-out device at the door screen.
 *
 * signOutCompletely only clears localStorage; it does not reload, so React is
 * still holding the previous session and the sign-in form never renders. The
 * reload is what actually returns the app to the door screen.
 */
async function freshDevice(page: import("@playwright/test").Page) {
  await page.goto("/");
  await signOutCompletely(page);
  await page.reload();
  await expect(
    page.getByPlaceholder(/Search facility name/i).or(page.getByPlaceholder("e.g. nurse")).first(),
  ).toBeVisible({ timeout: 30_000 });
}

async function attemptSignIn(
  page: import("@playwright/test").Page,
  username: string,
  pin: string,
) {
  const search = page.getByPlaceholder(/Search facility name/i);
  if (await search.isVisible().catch(() => false)) {
    await search.fill(DEMO_FACILITY);
    await page.getByRole("button", { name: new RegExp(DEMO_FACILITY.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).first().click();
  }
  const usernameInput = page.getByPlaceholder("e.g. nurse");
  await expect(usernameInput).toBeVisible({ timeout: 30_000 });
  await usernameInput.fill(username);
  await page.getByPlaceholder("••••").fill(pin);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test.describe("hub account adoption", () => {
  test("a hub-only account can sign in on a device that has never held it", async ({ page }) => {
    test.skip(!hubUp, "needs a live hub");
    await freshDevice(page);

    // Prove the premise: the local store genuinely has no such account.
    const localBefore = await page.evaluate(async (uname) => {
      const req = indexedDB.open("phc-track");
      const dbh = await new Promise<IDBDatabase>((ok, no) => {
        req.onsuccess = () => ok(req.result);
        req.onerror = () => no(req.error);
      });
      if (!dbh.objectStoreNames.contains("users")) return 0;
      const all = await new Promise<unknown[]>((ok) => {
        const r = dbh.transaction("users").objectStore("users").getAll();
        r.onsuccess = () => ok(r.result as unknown[]);
        r.onerror = () => ok([]);
      });
      return all.filter((u) => (u as { username?: string }).username === uname).length;
    }, HUB_ONLY_USERNAME);
    expect(localBefore, "account must not already be on the device").toBe(0);

    await attemptSignIn(page, HUB_ONLY_USERNAME, HUB_ONLY_PIN);

    // Signed in means adoption worked: the hub was consulted, accepted, and the
    // account was written locally.
    await expect(page.getByRole("link", { name: /^Patients$/ }).first()).toBeVisible({
      timeout: 30_000,
    });
  });

  test("the adopted account then signs in offline, with no hub", async ({ page, context }) => {
    test.skip(!hubUp, "needs a live hub");
    await freshDevice(page);
    await attemptSignIn(page, HUB_ONLY_USERNAME, HUB_ONLY_PIN);
    await expect(page.getByRole("link", { name: /^Patients$/ }).first()).toBeVisible({
      timeout: 30_000,
    });

    // The point of caching the account: the second sign-in must not need the
    // network. If this fails, adoption did not persist and a nurse is locked
    // out the moment connectivity drops.
    // Titled "Log out" in AppShell, and icon-only, so it is addressed by title.
    await page.getByTitle("Log out").click();
    await context.setOffline(true);
    await attemptSignIn(page, HUB_ONLY_USERNAME, HUB_ONLY_PIN);
    await expect(page.getByRole("link", { name: /^Patients$/ }).first()).toBeVisible({
      timeout: 30_000,
    });
    await context.setOffline(false);
  });

  test("a wrong PIN is refused without revealing that the username exists", async ({ page }) => {
    test.skip(!hubUp, "needs a live hub");
    await freshDevice(page);
    await attemptSignIn(page, HUB_ONLY_USERNAME, "definitelywrong");

    // One neutral message. The hub is internet-facing, so distinguishing
    // "no such user" from "wrong PIN" would make the form a username oracle
    // for every account in the LGA.
    await expect(page.getByText(/Username or PIN not recognised/i)).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole("link", { name: /^Patients$/ }).first()).toBeHidden();
  });

  test("an unknown username gets the same neutral message", async ({ page }) => {
    test.skip(!hubUp, "needs a live hub");
    await freshDevice(page);
    await attemptSignIn(page, "nobody.here.at.all", HUB_ONLY_PIN);

    await expect(page.getByText(/Username or PIN not recognised/i)).toBeVisible({
      timeout: 30_000,
    });
  });

  test("with no hub reachable, the message says so instead of blaming the PIN", async ({
    page,
    context,
  }) => {
    await freshDevice(page);
    await context.setOffline(true);
    await attemptSignIn(page, HUB_ONLY_USERNAME, HUB_ONLY_PIN);

    // A nurse on a dead network must not be told her credentials are wrong when
    // the app simply could not check them.
    await expect(page.getByText(/sync hub is unreachable/i)).toBeVisible({ timeout: 30_000 });
    await context.setOffline(false);
  });
});

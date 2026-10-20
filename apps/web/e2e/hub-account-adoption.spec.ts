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

/** A hub-only account the harness provisions. Never in the client seed. */
const HUB_ONLY_USERNAME = process.env.E2E_HUB_USERNAME ?? "adopt.test";
const HUB_ONLY_PIN = process.env.E2E_HUB_PIN ?? "adopt99331";

let hubUp = false;

test.beforeAll(async () => {
  try {
    const res = await fetch(`${API}/system/health`);
    hubUp = res.ok;
  } catch {
    hubUp = false;
  }
  if (!hubUp) {
    console.warn(`\nNo hub at ${API} — hub-adoption tests skipped.\n`);
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

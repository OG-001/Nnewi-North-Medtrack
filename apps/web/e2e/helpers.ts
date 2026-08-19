import { expect, type Page } from "@playwright/test";

export const DEMO_FACILITY = "Primary Health Centre Umuenem Otolo Nnewi";
export const SECOND_FACILITY = "Obiagu Health Post, Uruagu, Nnewi";

/**
 * Walk the door screen → facility → PIN sign-in flow.
 *
 * The door screen is skipped when a facility is already remembered (that is the
 * whole point of remembering it), so this tolerates landing straight on the
 * sign-in screen — or on the dashboard if a session is still live.
 */
export async function signIn(
  page: Page,
  { facility = DEMO_FACILITY, username = "nurse", pin = "2222" } = {},
) {
  await page.goto("/");

  const patientsLink = page.getByRole("link", { name: /^Patients$/ }).first();
  const search = page.getByPlaceholder(/Search facility name/i);
  const usernameInput = page.getByPlaceholder("e.g. nurse");

  // Three landing states are all legitimate — signed in, at the door screen, or
  // straight at sign-in because a facility is remembered. Wait for whichever
  // renders rather than racing the first paint.
  await expect(patientsLink.or(search).or(usernameInput).first()).toBeVisible({ timeout: 30_000 });

  if (await patientsLink.isVisible()) return;

  if (await search.isVisible()) {
    await search.fill(facility);
    await page
      .getByRole("button", { name: new RegExp(escapeRe(facility)) })
      .first()
      .click();
  }

  await usernameInput.fill(username);
  await page.getByPlaceholder("••••").fill(pin);
  await page.getByRole("button", { name: "Sign in" }).click();

  await page.getByRole("link", { name: /^Patients$/ }).first().waitFor({ state: "visible" });
}

/**
 * Block until the service worker controls the page.
 *
 * Without this the first `setOffline(true)` can land before the app shell is
 * precached, and the next reload fails with ERR_INTERNET_DISCONNECTED — a flaky
 * test rather than a real offline failure.
 */
export async function waitForServiceWorker(page: Page) {
  await page.waitForFunction(
    () => navigator.serviceWorker?.controller != null,
    undefined,
    { timeout: 30_000 },
  );
}

/** Drop the session so the next signIn() starts from the door screen. */
export async function signOutCompletely(page: Page) {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.removeItem("phc-track.session_user");
    localStorage.removeItem("phc-track.session_facility");
    localStorage.removeItem("phc-track.selected_facility");
  });
}

/**
 * Register a patient through the real form.
 *
 * Returns the surname, which the app renders as `{last} {first}` — a unique
 * surname per test is the cheapest stable handle on the new row.
 */
let phoneCounter = 0;

export async function registerPatient(
  page: Page,
  first: string,
  last: string,
  phone?: string,
): Promise<string> {
  // Patients sharing a phone number trip the duplicate-suspected guard, so each
  // test patient gets its own number unless the caller is testing that guard.
  phoneCounter += 1;
  const phoneNumber = phone ?? `+23480300${String(phoneCounter).padStart(5, "0")}`;

  await gotoPatients(page);
  await page.getByRole("button", { name: /Register patient/i }).first().click();

  await page.getByLabel(/First name/i).fill(first);
  await page.getByLabel(/Last name/i).fill(last);
  await page.getByLabel(/Phone \(primary/i).fill(phoneNumber);
  await page.getByLabel(/estimated age/i).fill("30");

  // If the form still flags a possible duplicate, acknowledge it explicitly —
  // saving is blocked until a human says these are different people.
  const overrideDuplicate = page.getByLabel(/create a new record anyway/i);
  if (await overrideDuplicate.isVisible().catch(() => false)) {
    await overrideDuplicate.check();
  }

  await page.getByRole("button", { name: /^Register patient$/ }).last().click();

  // Saving opens the new patient's record; the heading renders "{last} {first}".
  await expect(page.getByRole("heading", { name: new RegExp(last) })).toBeVisible();
  return last;
}

export async function gotoPatients(page: Page) {
  await page.getByRole("link", { name: /^Patients$/ }).first().click();
  await page.getByRole("button", { name: /Register patient/i }).first().waitFor();
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

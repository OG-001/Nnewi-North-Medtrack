/**
 * Regenerates the screenshot set under docs/evidence/screenshots.
 *
 * Requires the built PWA on :4173 (`pnpm build && pnpm preview`) and, for the
 * sync-status shots to show a real hub, the API on :3100 with the app built
 * using VITE_API_BASE_URL=http://localhost:3100/api/v1.
 *
 *   node scripts/capture-evidence.mjs
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const OUT = "/home/nnenna/MT/Nnewi-North-Medtrack/docs/evidence/screenshots";
mkdirSync(OUT, { recursive: true });

const BASE = "http://localhost:4173";
const FACILITY = "Primary Health Centre Umuenem Otolo Nnewi";

let n = 0;
const shot = async (page, name) => {
  n += 1;
  const file = `${OUT}/${String(n).padStart(2, "0")}-${name}.png`;
  await page.screenshot({ path: file, fullPage: false });
  console.log("saved", file);
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

// 1. Door screen — the full LGA facility registry
await page.goto(BASE);
await page.getByPlaceholder(/Search facility name/i).waitFor();
await page.waitForTimeout(800);
await shot(page, "facility-selection-all-phcs");

// 2. Search narrowing
await page.getByPlaceholder(/Search facility name/i).fill("Otolo");
await page.waitForTimeout(500);
await shot(page, "facility-search");

// 3. Sign-in, scoped to the chosen PHC
await page.getByRole("button", { name: new RegExp(FACILITY.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }).first().click();
await page.getByPlaceholder("e.g. nurse").waitFor();
await page.waitForTimeout(500);
await shot(page, "facility-scoped-login");

// 4. Dashboard
await page.getByPlaceholder("e.g. nurse").fill("nurse");
await page.getByPlaceholder("••••").fill("2222");
await page.getByRole("button", { name: "Sign in" }).click();
await page.getByRole("link", { name: /^Patients$/ }).first().waitFor();
await page.waitForTimeout(2500); // let the first hub sync settle
await shot(page, "facility-dashboard");

const go = async (name) => {
  await page.getByRole("link", { name: new RegExp(`^${name}$`) }).first().click();
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1500);
};

// 5. Patient register
await go("Patients");
await shot(page, "patient-register-search");

// 6. Registration form
const registerBtn = page.getByRole("button", { name: /Register patient/i }).first();
await registerBtn.waitFor({ state: "visible", timeout: 60_000 });
await registerBtn.click();
await page.getByLabel(/First name/i).waitFor({ timeout: 30_000 });
await page.waitForTimeout(700);
await shot(page, "patient-registration-form");
// Dismiss via the modal's own close control; the overlay otherwise swallows
// every later click.
await page.getByRole("button", { name: "Cancel" }).first().click();
await page.waitForTimeout(600);

// 7. Patient record / EMR
await go("Patients");
const firstPatient = page.locator("main button").filter({ hasText: /yr|days|months/ }).first();
if (await firstPatient.count()) {
  await firstPatient.click();
  await page.waitForTimeout(1200);
  await shot(page, "patient-record-emr");
}

// 8-11. Clinical modules
await go("Maternal / ANC");
await shot(page, "maternal-anc-tracking");
await go("Immunization");
await shot(page, "immunization-epi-schedule");
await go("Queue");
await shot(page, "clinic-queue");
await go("Reports");
await shot(page, "nhmis-reporting-dhis2-export");

await browser.close();
console.log(`\n${n} screenshots captured.`);

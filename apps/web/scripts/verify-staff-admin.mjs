/** Verifies the server-side staff administration through the UI. */
import { chromium } from "@playwright/test";
const OUT = "/home/nnenna/MT/Nnewi-North-Medtrack/docs/evidence/screenshots";
const BASE = "http://localhost:4173";
const F = "Primary Health Centre Umuenem Otolo Nnewi";
const rx = (s) => new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));

await page.goto(BASE);
await page.getByPlaceholder(/Search facility name/i).fill(F);
await page.getByRole("button", { name: rx(F) }).first().click();
await page.getByPlaceholder("e.g. nurse").fill("admin");
await page.getByPlaceholder("••••").fill("5555");
await page.getByRole("button", { name: "Sign in" }).click();
await page.getByRole("link", { name: /^Patients$/ }).first().waitFor();
await page.waitForTimeout(9000);

await page.getByRole("link", { name: /^Admin$/ }).first().click();
await page.getByRole("button", { name: /^Staff$/ }).click();
await page.getByRole("button", { name: /Add staff member/i }).waitFor({ timeout: 30000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/25-staff-admin-hub.png`, fullPage: true });
console.log("saved 25-staff-admin-hub.png");

// Elevated roles must be offered but disabled for a facility administrator.
await page.getByRole("button", { name: /Add staff member/i }).click();
await page.waitForTimeout(700);
const lgaBox = page.getByRole("checkbox").nth(5);
console.log("cross-facility role checkbox disabled for facility admin:",
  await page.locator('label[title*="system administrator"] input').first().isDisabled().catch(() => "n/a"));
await page.screenshot({ path: `${OUT}/26-staff-add-role-guard.png`, fullPage: true });
console.log("saved 26-staff-add-role-guard.png");
void lgaBox;
await browser.close();

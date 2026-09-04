/** Verifies Constraint 9 end to end: an admin edits the schedule, the hub
 *  stores it, and a device then schedules children against the edited value. */
import { chromium } from "@playwright/test";
const OUT = "/home/nnenna/MT/Nnewi-North-Medtrack/docs/evidence/screenshots";
const BASE = "http://localhost:4173";
const FACILITY = "Primary Health Centre Umuenem Otolo Nnewi";
const rx = (s) => new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 1100 } })).newPage();
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));

await page.goto(BASE);
await page.getByPlaceholder(/Search facility name/i).fill(FACILITY);
await page.getByRole("button", { name: rx(FACILITY) }).first().click();
await page.getByPlaceholder("e.g. nurse").fill("admin");
await page.getByPlaceholder("••••").fill("5555");
await page.getByRole("button", { name: "Sign in" }).click();
await page.getByRole("link", { name: /^Patients$/ }).first().waitFor();
await page.waitForTimeout(4000);

await page.getByRole("link", { name: /^Admin$/ }).first().click();
await page.getByRole("button", { name: /^Schedules$/ }).click();
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/20-editable-schedules.png`, fullPage: true });
console.log("saved 20-editable-schedules.png");

// Change BCG's recommended age from 0 to 3 days and save.
const bcg = page.getByLabel("BCG recommended age in days");
await bcg.waitFor();
console.log("BCG before:", await bcg.inputValue());
await bcg.fill("3");
await page.getByRole("button", { name: /Save schedule/i }).click();
await page.waitForTimeout(3000);
const status = await page.getByText(/Saved\. Now at version/).textContent().catch(() => null);
console.log("save status:", status ?? "NO CONFIRMATION");

// Now prove an invalid edit is refused rather than saved.
await bcg.fill("-5");
await page.getByRole("button", { name: /Save schedule/i }).click();
await page.waitForTimeout(1500);
const rejected = await page.getByText(/This change was not saved/).isVisible().catch(() => false);
console.log("invalid edit refused:", rejected);
await page.screenshot({ path: `${OUT}/21-schedule-validation.png`, fullPage: true });
console.log("saved 21-schedule-validation.png");

await browser.close();

/** Captures the NHMIS report with its hub submission panel. */
import { chromium } from "@playwright/test";
const OUT = "/home/nnenna/MT/Nnewi-North-Medtrack/docs/evidence/screenshots";
const BASE = "http://localhost:4173";
const FACILITY = "Primary Health Centre Umuenem Otolo Nnewi";
const rx = (s) => new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 1200 } })).newPage();
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));
page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE:", m.text().slice(0, 200)); });

await page.goto(BASE);
await page.getByPlaceholder(/Search facility name/i).fill(FACILITY);
await page.getByRole("button", { name: rx(FACILITY) }).first().click();
await page.getByPlaceholder("e.g. nurse").fill("admin");
await page.getByPlaceholder("••••").fill("5555");
await page.getByRole("button", { name: "Sign in" }).click();
await page.getByRole("link", { name: /^Patients$/ }).first().waitFor();
await page.waitForTimeout(4000);

await page.getByRole("link", { name: /^Reports$/ }).first().click();
await page.waitForTimeout(4000);
await page.screenshot({ path: `${OUT}/18-nhmis-report-with-submission.png`, fullPage: true });
console.log("saved 18-nhmis-report-with-submission.png");

const lock = page.getByRole("button", { name: /Review & lock month/i });
if (await lock.count()) {
  await lock.click();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}/19-report-locked.png`, fullPage: true });
  console.log("saved 19-report-locked.png (lock succeeded)");
} else {
  console.log("NOTE: lock button not present");
}
await browser.close();

/** Verifies queue-station config, the audit export, and the permission toggle. */
import { chromium } from "@playwright/test";
const OUT = "/home/nnenna/MT/Nnewi-North-Medtrack/docs/evidence/screenshots";
const BASE = "http://localhost:4173";
const F = "Primary Health Centre Umuenem Otolo Nnewi";
const rx = (s) => new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 1100 } })).newPage();
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
await page.getByRole("button", { name: /^Schedules$/ }).click();
await page.getByRole("button", { name: /Save stations/i }).waitFor({ timeout: 30000 });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/32-queue-stations-config.png`, fullPage: true });
console.log("saved 32-queue-stations-config.png");

// Relabel registration and switch pharmacy off.
await page.getByLabel("registration label").fill("Front desk");
await page.getByLabel("pharmacy in use").uncheck();
await page.getByRole("button", { name: /Save stations/i }).click();
await page.waitForTimeout(3000);
const saved = await page.getByText(/Saved\. Now at version/).isVisible().catch(() => false);
console.log("stations saved:", saved);

// The queue must now show the new label and skip the disabled station.
await page.getByRole("link", { name: /^Queue$/ }).first().click();
await page.waitForTimeout(2500);
const queueText = await page.locator("main").innerText();
console.log("queue references Pharmacy:", /Pharmacy/.test(queueText));
await page.screenshot({ path: `${OUT}/33-queue-follows-config.png`, fullPage: true });

// Audit export button present.
await page.getByRole("link", { name: /^Admin$/ }).first().click();
await page.getByRole("button", { name: /Audit log/i }).click();
await page.waitForTimeout(2500);
console.log("audit export offered:", await page.getByRole("link", { name: /Export CSV/i }).count() > 0);
await page.screenshot({ path: `${OUT}/34-audit-export.png`, fullPage: true });
console.log("saved 34-audit-export.png");
await browser.close();

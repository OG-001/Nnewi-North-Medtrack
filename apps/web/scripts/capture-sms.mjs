/** Captures the SMS administration screen for the evidence set. */
import { chromium } from "@playwright/test";
const OUT = "/home/nnenna/MT/Nnewi-North-Medtrack/docs/evidence/screenshots";
const BASE = "http://localhost:4173";
const FACILITY = "Primary Health Centre Umuenem Otolo Nnewi";
const rx = (s) => new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));

await page.goto(BASE);
await page.getByPlaceholder(/Search facility name/i).fill(FACILITY);
await page.getByRole("button", { name: rx(FACILITY) }).first().click();
// Facility admin: can edit templates as well as send.
await page.getByPlaceholder("e.g. nurse").fill("admin");
await page.getByPlaceholder("••••").fill("5555");
await page.getByRole("button", { name: "Sign in" }).click();
await page.getByRole("link", { name: /^Patients$/ }).first().waitFor();
await page.waitForTimeout(4000);

await page.goto(`${BASE}/admin`);
await page.getByRole("button", { name: "SMS" }).click();
await page.waitForTimeout(3000);
await page.screenshot({ path: `${OUT}/16-sms-templates-and-log.png` });
console.log("saved 16-sms-templates-and-log.png");

// Open a template editor to show the bilingual bodies and live preview.
await page.getByRole("button", { name: /Upcoming antenatal visit/i }).click();
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/17-sms-template-editor.png` });
console.log("saved 17-sms-template-editor.png");

await browser.close();

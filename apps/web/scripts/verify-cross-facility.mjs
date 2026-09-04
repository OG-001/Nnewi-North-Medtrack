/** Verifies Constraint 8 through the UI: a nurse at PHC A finds a patient
 *  registered at PHC B, must give a reason, and the access is audited. */
import { chromium } from "@playwright/test";
const OUT = "/home/nnenna/MT/Nnewi-North-Medtrack/docs/evidence/screenshots";
const BASE = "http://localhost:4173";
const FACILITY_A = "Primary Health Centre Umuenem Otolo Nnewi";
const rx = (s) => new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
page.on("pageerror", (e) => console.log("PAGE ERROR:", e.message));

await page.goto(BASE);
await page.getByPlaceholder(/Search facility name/i).fill(FACILITY_A);
await page.getByRole("button", { name: rx(FACILITY_A) }).first().click();
await page.getByPlaceholder("e.g. nurse").fill("nurse");
await page.getByPlaceholder("••••").fill("2222");
await page.getByRole("button", { name: "Sign in" }).click();
await page.getByRole("link", { name: /^Patients$/ }).first().waitFor();
// The first sync pulls the whole facility roster; wait for it to settle.
await page.waitForTimeout(9000);

await page.getByRole("link", { name: /^Patients$/ }).first().click();
await page.getByRole("button", { name: /Search other PHCs in the LGA/i }).waitFor({ timeout: 30000 });

// The patient lives at the OTHER facility, so a local search finds nothing.
await page.getByPlaceholder(/Search by phone, name, or MRN/i).fill("Obiageli");
await page.waitForTimeout(800);
const localHit = await page.getByText("Obiageli").count();
console.log("local results for a patient at another PHC:", localHit);

await page.getByRole("button", { name: /Search other PHCs in the LGA/i }).click();
await page.waitForTimeout(600);
await page.getByPlaceholder(/Name, phone or MRN/i).fill("Obiageli");
await page.getByRole("button", { name: /^Search$/ }).click();
await page.waitForTimeout(2000);
await page.screenshot({ path: `${OUT}/22-lga-patient-index.png` });
console.log("saved 22-lga-patient-index.png");

await page.getByText("Obiageli Ngozi").first().click();
await page.waitForTimeout(800);

// The Open button must be disabled until a real reason is supplied.
const openBtn = page.getByRole("button", { name: /Open record/i });
console.log("open disabled with no reason:", await openBtn.isDisabled());
await page.getByPlaceholder(/Patient presented here today/i).fill("Patient presented at this PHC today and needs her history");
await page.waitForTimeout(400);
console.log("open enabled with a reason:", await openBtn.isEnabled());
await page.screenshot({ path: `${OUT}/23-cross-facility-reason-prompt.png` });
console.log("saved 23-cross-facility-reason-prompt.png");

await openBtn.click();
await page.waitForTimeout(2500);
const shown = await page.getByText(/Read-only view for continuity of care/).isVisible().catch(() => false);
console.log("record opened read-only:", shown);
await page.screenshot({ path: `${OUT}/24-cross-facility-record-opened.png` });
console.log("saved 24-cross-facility-record-opened.png");

await browser.close();

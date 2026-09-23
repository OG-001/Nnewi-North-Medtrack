/** Verifies the duplicate review and merge flow through the UI. */
import { chromium } from "@playwright/test";
const OUT = "/home/nnenna/MT/Nnewi-North-Medtrack/docs/evidence/screenshots";
const BASE = "http://localhost:4173";
const F = "Primary Health Centre Umuenem Otolo Nnewi";
const rx = (s) => new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 1050 } })).newPage();
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
await page.getByRole("button", { name: /^Duplicates$/ }).click();
await page.waitForTimeout(1200);

await page.getByPlaceholder(/Name, phone or MRN/i).fill("Okafor");
await page.getByRole("button", { name: /^Search$/ }).click();
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/27-duplicate-search.png`, fullPage: true });
console.log("saved 27-duplicate-search.png");

// Keep the A record.
await page.getByText("NNW0062-DUP-A").first().click();
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/28-duplicate-candidates.png`, fullPage: true });
const evidence = await page.getByText("Same phone number").count();
console.log("candidate shows evidence:", evidence > 0);
console.log("history-at-stake shown:", await page.getByText(/linked record/).count() > 0);

await page.getByRole("button", { name: /Merge into the kept record/i }).first().click();
await page.waitForTimeout(800);
const confirm = page.getByRole("button", { name: /Confirm merge/i });
console.log("confirm disabled without a reason:", await confirm.isDisabled());
await page.getByPlaceholder(/Same woman registered twice/i).fill("Confirmed the same woman against the paper ANC register");
await page.waitForTimeout(400);
console.log("confirm enabled with a reason:", await confirm.isEnabled());
await page.screenshot({ path: `${OUT}/29-merge-confirm.png`, fullPage: true });

await confirm.click();
await page.waitForTimeout(3500);
const merged = await page.getByText(/^Merged\.$/).isVisible().catch(() => false);
console.log("merge succeeded:", merged);
await page.screenshot({ path: `${OUT}/30-merge-result.png`, fullPage: true });
console.log("saved 30-merge-result.png");
await browser.close();

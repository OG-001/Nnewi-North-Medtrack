/**
 * Captures the offline-to-reconciled journey: the claim the whole project rests
 * on. Produces screenshots 12 to 15 plus a ~1 minute screen recording under
 * docs/evidence/video.
 *
 * Requires the built PWA on :4173 and the sync hub on :3100.
 *   node scripts/capture-offline-demo.mjs
 */
import { chromium } from "@playwright/test";
import { mkdirSync, readdirSync, renameSync } from "node:fs";

const ROOT = "/home/nnenna/MT/Nnewi-North-Medtrack/docs/evidence";
const SHOTS = `${ROOT}/screenshots`;
const VIDEO = `${ROOT}/video`;
mkdirSync(SHOTS, { recursive: true });
mkdirSync(VIDEO, { recursive: true });

const BASE = "http://localhost:4173";
const FACILITY = "Primary Health Centre Umuenem Otolo Nnewi";
const rx = (s) => new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

const shot = async (page, name) => {
  const file = `${SHOTS}/${name}.png`;
  await page.screenshot({ path: file });
  console.log("saved", file);
};

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: VIDEO, size: { width: 1440, height: 900 } },
});
const page = await context.newPage();

// --- Sign in ---
await page.goto(BASE);
await page.getByPlaceholder(/Search facility name/i).fill(FACILITY);
await page.waitForTimeout(1200);
await page.getByRole("button", { name: rx(FACILITY) }).first().click();
await page.getByPlaceholder("e.g. nurse").fill("nurse");
await page.getByPlaceholder("••••").fill("2222");
await page.waitForTimeout(800);
await page.getByRole("button", { name: "Sign in" }).click();
await page.getByRole("link", { name: /^Patients$/ }).first().waitFor();
await page.waitForTimeout(3000);

// Service worker must control the page before the network is cut.
await page.waitForFunction(() => navigator.serviceWorker?.controller != null, undefined, {
  timeout: 30_000,
});

// --- Go offline ---
await context.setOffline(true);
await page.waitForTimeout(2500);
await shot(page, "12-offline-indicator");

// --- Register a patient with no network ---
await page.getByRole("link", { name: /^Patients$/ }).first().click();
await page.waitForTimeout(1500);
await page.getByRole("button", { name: /Register patient/i }).first().click();
await page.getByLabel(/First name/i).waitFor();
await page.getByLabel(/First name/i).fill("Chiamaka");
await page.waitForTimeout(400);
await page.getByLabel(/Last name/i).fill("Okonkwo");
await page.waitForTimeout(400);
await page.getByLabel(/Phone \(primary/i).fill("+2348031234567");
await page.getByLabel(/estimated age/i).fill("27");
await page.waitForTimeout(1200);
await shot(page, "13-offline-patient-registration");

await page.getByRole("button", { name: /^Register patient$/ }).last().click();
await page.waitForTimeout(2500);
await shot(page, "14-offline-record-saved");

// --- Reconnect and let it reconcile with the hub ---
await context.setOffline(false);
await page.waitForTimeout(1000);
await page.getByRole("link", { name: /^Dashboard$/ }).first().click();
await page.waitForTimeout(8000); // sync cycle: push then pull
await shot(page, "15-reconciled-with-sync-hub");

await page.waitForTimeout(1500);
await context.close();
await browser.close();

// Give the recording a meaningful filename.
const produced = readdirSync(VIDEO).filter((f) => f.endsWith(".webm"));
for (const f of produced) {
  if (f !== "phc-track-offline-sync-demo.webm") {
    renameSync(`${VIDEO}/${f}`, `${VIDEO}/phc-track-offline-sync-demo.webm`);
  }
}
console.log("video:", `${VIDEO}/phc-track-offline-sync-demo.webm`);

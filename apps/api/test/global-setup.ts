/**
 * Probes for a running sync hub before tests are collected, so the live-hub
 * suite can be skipped as a whole rather than failing on a refused connection.
 */
const API = process.env.E2E_API_URL ?? "http://localhost:3100/api/v1";

export default async function setup() {
  try {
    const res = await fetch(`${API}/system/health`);
    process.env.PHC_HUB_UP = res.ok ? "1" : "0";
  } catch {
    process.env.PHC_HUB_UP = "0";
  }
  if (process.env.PHC_HUB_UP !== "1") {
    console.warn(`\nNo hub at ${API} — live-hub tests skipped. See test/e2e-sync.sh for setup.\n`);
  }
}

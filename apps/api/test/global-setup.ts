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
    return;
  }

  // SMS dispatch is behind a deployment kill switch. When it is off the hub
  // refuses every send, so the suites that exercise dispatch skip rather than
  // fail. The consent gate, template rendering and phone normalisation are pure
  // functions covered in packages/shared regardless.
  try {
    const res = await fetch(`${API}/system/compliance`);
    const body = (await res.json()) as { features?: { sms_enabled?: boolean } };
    process.env.PHC_SMS_ENABLED = body.features?.sms_enabled ? "1" : "0";
  } catch {
    process.env.PHC_SMS_ENABLED = "0";
  }
  if (process.env.PHC_SMS_ENABLED !== "1") {
    console.warn(
      "\nSMS is switched off for this deployment — SMS dispatch tests skipped.\n" +
        "Set SMS_ENABLED=true on the hub to exercise them.\n",
    );
  }
}

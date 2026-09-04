/**
 * Hub session lifecycle, layered on top of local sign-in.
 *
 * Local PIN auth stays the source of truth for getting into the app: a clinic
 * device must open and work with no network at all (offline-sync-design §1).
 * The hub session is established *opportunistically* alongside it, and every
 * failure here is non-fatal — the user is already signed in locally.
 */
import { enroll, purgeOutOfScope } from "./sync-engine";
import { hubLogin, hubLogout, hubReachable } from "./api";
import { syncNow } from "./sync";
import { getDeviceId } from "./device";
import { loadCachedConfig, refreshConfigFromHub } from "./clinical-config";

/**
 * Try to sign in to the hub and bring the device up to date.
 *
 * Returns the granted facility scope on success, or null when there is no hub
 * to talk to. Never throws — callers treat it as best-effort.
 */
/** Load the cached config so an offline device schedules correctly too. */
export async function primeClinicalConfig(): Promise<void> {
  await loadCachedConfig();
}

export async function establishHubSession(
  username: string,
  pin: string,
  facilityId: string,
): Promise<string[] | null> {
  try {
    if (!(await hubReachable())) return null;

    await hubLogin(username, pin, facilityId, getDeviceId());
    const enrollment = await enroll(navigator.userAgent.slice(0, 100));

    // Privacy: drop anything the hub did not grant this device (§7, §9).
    await purgeOutOfScope(enrollment.scope);

    // Clinical config is hub-authoritative and flows one way. Pull it before
    // syncing so any scheduling done this session uses the current schedule.
    await refreshConfigFromHub();
    await syncNow();

    return enrollment.scope;
  } catch (err) {
    // A hub that rejects us (revoked device, deactivated account, wrong PIN at
    // the hub) must not lock a nurse out of an already-working local session.
    console.warn("Hub session unavailable; continuing offline-first.", err);
    return null;
  }
}

export async function endHubSession(): Promise<void> {
  try {
    await hubLogout();
  } catch {
    // Logging out locally is what matters; the refresh token expires on its own.
  }
}

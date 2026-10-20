/**
 * Hub session lifecycle, layered on top of local sign-in.
 *
 * Local PIN auth stays the source of truth for getting into the app: a clinic
 * device must open and work with no network at all (offline-sync-design §1).
 * The hub session is established *opportunistically* alongside it, and every
 * failure here is non-fatal — the user is already signed in locally.
 */
import { db } from "../db/db";
import type { UserAccount } from "../db/types";
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

/**
 * Outcome of trying to adopt an account this device has never held.
 *
 * Distinct cases, because the caller shows the user a different message for
 * each and `establishHubSession` deliberately flattens them all to null.
 */
export type AdoptOutcome =
  | { outcome: "ok"; account: UserAccount }
  | { outcome: "hub_unreachable" }
  | { outcome: "rejected" };

/**
 * First contact: sign in an account that exists on the hub but not yet on this
 * device, and leave it in the local store so later sign-ins work offline.
 *
 * WHY THIS EXISTS. Local PIN auth is the source of truth for getting into the
 * app, which is what makes the offline guarantee real. But staff accounts only
 * reach a device by syncing down, syncing needs an enrolled device, and
 * enrolment needs a hub session that was previously only attempted *after* a
 * successful local sign-in. A freshly installed device could therefore only
 * sign in with an account already in its local store, which in practice meant
 * one the demo seed had planted. A real deployment had no way in at all.
 *
 * This closes that loop without weakening the offline path: local is still
 * tried first, and the hub is consulted only when local has no answer.
 */
export async function adoptAccountFromHub(
  username: string,
  pin: string,
  facilityId: string,
): Promise<AdoptOutcome> {
  // Separated from the call below so "no hub here" stays distinguishable from
  // "the hub said no". Collapsing them would tell a nurse on a dead network
  // that her PIN is wrong.
  let reachable: boolean;
  try {
    reachable = await hubReachable();
  } catch {
    reachable = false;
  }
  if (!reachable) return { outcome: "hub_unreachable" };

  try {
    const session = await hubLogin(username, pin, facilityId, getDeviceId());
    const enrollment = await enroll(navigator.userAgent.slice(0, 100));
    await purgeOutOfScope(enrollment.scope);

    // The hub is authoritative on scope. A null scope means LGA-wide, which is
    // stored as the full local registry so the sign-in check below, and every
    // later scope filter, sees an explicit list rather than a special case.
    const granted =
      enrollment.scope ?? (await db.facilities.toArray()).map((f) => f.id);

    const now = new Date().toISOString();
    const account: UserAccount = {
      id: session.user.id,
      facility_id: facilityId,
      created_at: now,
      created_by: session.user.id,
      updated_at: now,
      updated_by: session.user.id,
      rev: 1,
      deleted_at: null,
      origin_device_id: getDeviceId(),
      full_name: session.user.fullName,
      username: session.user.username.toLowerCase(),
      // Cached so this account can sign in offline next time, which is the
      // whole point of adopting it. The local store is not encrypted; that
      // residual risk is documented in ndpa-compliance.md and mitigated by
      // device encryption, auto-lock and purge on logout.
      pin,
      phone: "",
      status: "active",
      roles: session.roles as UserAccount["roles"],
      facility_ids: granted,
      last_login_at: now,
    };

    // Written straight to the table, like the sync engine's apply path and for
    // the same reason: this is hub-authoritative data arriving, not a user
    // edit. Going through the repository layer would append an outbox entry and
    // push the account back to the hub that just sent it.
    await db.users.put(account);

    await refreshConfigFromHub();
    await syncNow();

    return { outcome: "ok", account };
  } catch (err) {
    // Deliberately one outcome for every rejection: unknown username, wrong
    // PIN, account not provisioned for this facility, device revoked. The hub
    // is internet-facing, so distinguishing them would turn the sign-in form
    // into a username oracle for every account in the LGA.
    console.warn("Hub rejected first-contact sign-in.", err);
    return { outcome: "rejected" };
  }
}

export async function endHubSession(): Promise<void> {
  try {
    await hubLogout();
  } catch {
    // Logging out locally is what matters; the refresh token expires on its own.
  }
}

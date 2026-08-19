/**
 * Sync-status store — implements the UI-visible state machine from
 * offline-sync-design §4 (Offline / Pending(n) / Syncing / Synced / Conflict).
 *
 * Writes land in the outbox; a cycle pushes them to the hub and pulls back what
 * other devices recorded (see sync-engine.ts for the protocol itself).
 *
 * When no hub is configured or reachable, the app stays fully usable and the
 * outbox simply keeps accumulating — the network is never on the critical path
 * for care (§1). Pending work drains on the next successful cycle.
 */
import { useSyncExternalStore } from "react";
import type { SyncState } from "@phc/shared";
import { db } from "../db/db";
import { hasHubSession, hubReachable } from "./api";
import { runSyncCycle } from "./sync-engine";

interface SyncSnapshot {
  state: SyncState;
  online: boolean;
  pending: number;
  conflicts: number;
  lastSyncAt: string | null;
}

let snapshot: SyncSnapshot = {
  state: navigator.onLine ? "synced" : "offline",
  online: navigator.onLine,
  pending: 0,
  conflicts: 0,
  lastSyncAt: localStorage.getItem("phc-track.last_sync_at"),
};

const listeners = new Set<() => void>();

function emit() {
  snapshot = { ...snapshot };
  for (const l of listeners) l();
}

function deriveState() {
  if (!snapshot.online) {
    snapshot.state = "offline";
  } else if (snapshot.conflicts > 0) {
    snapshot.state = "conflict";
  } else if (snapshot.pending > 0) {
    snapshot.state = "pending";
  } else {
    snapshot.state = "synced";
  }
}

async function refreshCounts() {
  const [pending, conflicts] = await Promise.all([
    db.outbox.where("status").anyOf("pending", "in_flight").count(),
    db.outbox.where("status").equals("conflict").count(),
  ]);
  snapshot.pending = pending;
  snapshot.conflicts = conflicts;
  deriveState();
  emit();
}

/** Called by the repository after a write so the indicator updates promptly. */
export function bumpPending() {
  void refreshCounts();
}

let syncing = false;

/** Set when the last cycle failed, so the UI can explain why work is pending. */
let lastError: string | null = null;

export function getSyncError(): string | null {
  return lastError;
}

/**
 * Push local work to the hub, then pull what changed elsewhere.
 *
 * A missing or unreachable hub is not an error state for the clinic: the app
 * keeps working offline-first and the outbox drains later.
 */
export async function syncNow(): Promise<void> {
  if (syncing || !snapshot.online) return;
  syncing = true;
  snapshot.state = "syncing";
  emit();
  try {
    if (!hasHubSession() || !(await hubReachable())) {
      // No hub yet (or it is down) — keep the pending count honest and wait.
      lastError = hasHubSession() ? "Sync hub unreachable" : null;
      return;
    }
    const result = await runSyncCycle();
    lastError = result.rejected > 0 ? `${result.rejected} change(s) rejected by the hub` : null;
    const stamp = new Date().toISOString();
    snapshot.lastSyncAt = stamp;
    localStorage.setItem("phc-track.last_sync_at", stamp);
  } catch (err) {
    lastError = err instanceof Error ? err.message : "Sync failed";
  } finally {
    syncing = false;
    await refreshCounts();
  }
}

/** How often to try a cycle while the app is open and online. */
const PERIODIC_SYNC_MS = 5 * 60_000;

/**
 * Triggers from offline-sync-design §3.3: reconnect, app focus, a periodic
 * timer while online, explicit "Sync now", and the service worker's Background
 * Sync where the browser supports it.
 */
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    snapshot.online = true;
    deriveState();
    emit();
    void syncNow();
  });
  window.addEventListener("offline", () => {
    snapshot.online = false;
    deriveState();
    emit();
  });

  // Returning to the tab is the moment a nurse is most likely to have moved
  // back into coverage.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void syncNow();
  });
  window.addEventListener("focus", () => void syncNow());

  setInterval(() => {
    if (snapshot.online && snapshot.pending > 0) void syncNow();
  }, PERIODIC_SYNC_MS);

  // Background Sync lets the browser retry after the tab is closed. Not
  // supported everywhere (notably iOS Safari), so it is strictly an addition to
  // the triggers above, never a replacement.
  void registerBackgroundSync();

  // Initial count once the DB is ready.
  void refreshCounts();
}

async function registerBackgroundSync() {
  try {
    if (!("serviceWorker" in navigator)) return;
    const reg = (await navigator.serviceWorker.ready) as ServiceWorkerRegistration & {
      sync?: { register: (tag: string) => Promise<void> };
    };
    await reg.sync?.register("phc-sync");
  } catch {
    // Unsupported or blocked — the in-page triggers still cover every case.
  }
}

export function subscribeSync(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getSyncSnapshot(): SyncSnapshot {
  return snapshot;
}

export function useSync(): SyncSnapshot {
  return useSyncExternalStore(subscribeSync, getSyncSnapshot, getSyncSnapshot);
}

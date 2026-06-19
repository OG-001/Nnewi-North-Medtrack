/**
 * Sync-status store — implements the UI-visible state machine from
 * offline-sync-design §4 (Offline / Pending(n) / Syncing / Synced / Conflict).
 *
 * The real pull/push protocol against the NestJS hub is Phase 3. Here we run the
 * local side faithfully: writes land in the outbox; "Sync now" drains pending
 * entries (push→ack) and stamps last-synced. When a hub exists, replace
 * `drainOutbox` with the §3 POST /sync/push + GET /sync/changes calls.
 */
import { useSyncExternalStore } from "react";
import type { SyncState } from "@phc/shared";
import { db } from "../db/db";

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

/** Drain the outbox (simulated push→ack). Replace with hub calls in Phase 3. */
export async function syncNow(): Promise<void> {
  if (syncing || !snapshot.online) return;
  syncing = true;
  snapshot.state = "syncing";
  emit();
  try {
    const pending = await db.outbox
      .where("status")
      .anyOf("pending", "in_flight")
      .toArray();
    // Simulate network latency proportional to batch size (capped).
    await new Promise((r) => setTimeout(r, Math.min(600, 120 + pending.length * 20)));
    await db.transaction("rw", db.outbox, async () => {
      for (const e of pending) {
        if (e.localSeq != null) {
          await db.outbox.update(e.localSeq, { status: "acked" });
        }
      }
    });
    const stamp = new Date().toISOString();
    snapshot.lastSyncAt = stamp;
    localStorage.setItem("phc-track.last_sync_at", stamp);
  } finally {
    syncing = false;
    await refreshCounts();
  }
}

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
  // Initial count once the DB is ready.
  void refreshCounts();
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

import { syncNow, useSync } from "../lib/sync";
import { relativeTime } from "../lib/format";
import { IconSync } from "./icons";

const STATE_META: Record<
  string,
  { label: (n: number) => string; dot: string; text: string }
> = {
  offline: { label: () => "Offline", dot: "bg-slate-400", text: "text-slate-600" },
  pending: {
    label: (n) => `Pending (${n})`,
    dot: "bg-amber-500",
    text: "text-amber-700",
  },
  syncing: { label: () => "Syncing…", dot: "bg-sky-500 animate-pulse", text: "text-sky-700" },
  synced: { label: () => "Synced", dot: "bg-brand-500", text: "text-brand-700" },
  conflict: {
    label: (n) => `Conflict — review (${n})`,
    dot: "bg-red-500",
    text: "text-red-700",
  },
};

export function SyncStatusIndicator() {
  const sync = useSync();
  const meta = STATE_META[sync.state] ?? STATE_META.synced;
  const count = sync.state === "conflict" ? sync.conflicts : sync.pending;

  return (
    <button
      onClick={() => void syncNow()}
      disabled={!sync.online || sync.state === "syncing"}
      title={`Last sync: ${relativeTime(sync.lastSyncAt)} · click to sync now`}
      className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium shadow-sm transition hover:bg-slate-50 disabled:cursor-default disabled:opacity-80"
    >
      <span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} />
      <span className={meta.text}>{meta.label(count)}</span>
      {sync.online && sync.state !== "syncing" && (
        <IconSync width={14} height={14} className="text-slate-400" />
      )}
    </button>
  );
}

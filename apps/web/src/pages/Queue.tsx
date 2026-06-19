import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import {
  toISODate,
  type QueuePriority,
  type QueueService,
  type QueueStation,
  type QueueStatus,
} from "@phc/shared";
import { db } from "../db/db";
import { createRecord, saveRecord } from "../db/repository";
import { useSession } from "../lib/session";
import { useScope, notDeleted } from "../lib/scope";
import { Badge, EmptyState, Field, Modal, PageHeader, StatCard } from "../components/ui";
import { IconPlus, IconClock } from "../components/icons";
import { displayName, patientAge, relativeTime, titleCase } from "../lib/format";
import type { Patient, QueueEntry } from "../db/types";

const STATION_FLOW: QueueStation[] = ["registration", "vitals", "consultation", "pharmacy"];

const STATUS_TONE: Record<QueueStatus, "amber" | "blue" | "green" | "slate"> = {
  waiting: "amber",
  in_progress: "blue",
  completed: "green",
  left_without_being_seen: "slate",
};

export function QueuePage() {
  const { actor } = useSession();
  const scope = useScope();
  const today = toISODate(new Date());
  const [showAdd, setShowAdd] = useState(false);

  const entries = useLiveQuery(() => db.queueEntries.where("queue_date").equals(today).toArray(), [today], []);
  const patients = useLiveQuery(() => db.patients.toArray(), [], []);
  const patientById = useMemo(() => new Map(patients.map((p) => [p.id, p])), [patients]);

  const scoped = useMemo(
    () =>
      notDeleted(entries)
        .filter(scope.inScope)
        .sort((a, b) => {
          const prio = (p: QueuePriority) => (p === "emergency" ? 0 : p === "priority" ? 1 : 2);
          if (prio(a.priority) !== prio(b.priority)) return prio(a.priority) - prio(b.priority);
          return a.checked_in_at.localeCompare(b.checked_in_at);
        }),
    [entries, scope],
  );

  const waiting = scoped.filter((q) => q.status === "waiting");
  const inProgress = scoped.filter((q) => q.status === "in_progress");
  const completed = scoped.filter((q) => q.status === "completed");

  async function transition(q: QueueEntry, status: QueueStatus, station?: QueueStation) {
    if (!actor) return;
    const patch: Partial<QueueEntry> = { status };
    if (station) patch.station = station;
    if (status === "in_progress" && !q.started_at) patch.started_at = new Date().toISOString();
    if (status === "completed") patch.completed_at = new Date().toISOString();
    await saveRecord(db.queueEntries, { ...q, ...patch }, actor, "update");
  }

  return (
    <div>
      <PageHeader
        title="Queue & workflow"
        subtitle={`Today · ${scoped.length} checked in`}
        actions={
          <button className="btn-primary" onClick={() => setShowAdd(true)}>
            <IconPlus width={16} height={16} /> Add to queue
          </button>
        }
      />

      <div className="mb-5 grid grid-cols-3 gap-3">
        <StatCard label="Waiting" value={waiting.length} tone={waiting.length ? "warn" : "default"} />
        <StatCard label="In progress" value={inProgress.length} tone="good" />
        <StatCard label="Completed" value={completed.length} />
      </div>

      {scoped.length === 0 ? (
        <EmptyState title="Queue is empty" hint="Add an arriving patient to today's queue." />
      ) : (
        <div className="space-y-5">
          <QueueColumn title="Waiting" entries={waiting} patientById={patientById} onTransition={transition} />
          <QueueColumn title="In progress" entries={inProgress} patientById={patientById} onTransition={transition} />
          {completed.length > 0 && (
            <QueueColumn title="Completed" entries={completed} patientById={patientById} onTransition={transition} collapsed />
          )}
        </div>
      )}

      <Modal open={showAdd} title="Add patient to queue" onClose={() => setShowAdd(false)}>
        <AddToQueue patients={notDeleted(patients).filter(scope.inScope)} onDone={() => setShowAdd(false)} />
      </Modal>
    </div>
  );
}

function QueueColumn({
  title,
  entries,
  patientById,
  onTransition,
  collapsed,
}: {
  title: string;
  entries: QueueEntry[];
  patientById: Map<string, Patient>;
  onTransition: (q: QueueEntry, s: QueueStatus, station?: QueueStation) => void;
  collapsed?: boolean;
}) {
  if (entries.length === 0) return null;
  return (
    <div>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
        {title} ({entries.length})
      </h2>
      <div className="card divide-y divide-slate-100">
        {entries.map((q) => {
          const p = patientById.get(q.patient_id);
          const nextStation = STATION_FLOW[STATION_FLOW.indexOf(q.station) + 1];
          return (
            <div key={q.id} className={`flex items-center gap-3 px-4 py-3 ${collapsed ? "opacity-60" : ""}`}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {p ? (
                    <Link to={`/patients/${p.id}`} className="truncate font-semibold text-slate-800 hover:text-brand-700">
                      {displayName(p)}
                    </Link>
                  ) : (
                    <span className="text-slate-400">Unknown</span>
                  )}
                  {q.priority !== "normal" && <Badge tone={q.priority === "emergency" ? "red" : "amber"}>{q.priority}</Badge>}
                  <Badge tone={STATUS_TONE[q.status]}>{titleCase(q.status)}</Badge>
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                  <span className="capitalize">{q.service} · {q.station}</span>
                  <span className="inline-flex items-center gap-1 text-slate-400">
                    <IconClock width={12} height={12} /> {relativeTime(q.checked_in_at)}
                  </span>
                </div>
              </div>
              {q.status !== "completed" && q.status !== "left_without_being_seen" && (
                <div className="flex shrink-0 gap-1">
                  {q.status === "waiting" && (
                    <button className="btn-secondary !px-2 !py-1 text-xs" onClick={() => onTransition(q, "in_progress")}>
                      Start
                    </button>
                  )}
                  {q.status === "in_progress" && nextStation && (
                    <button className="btn-secondary !px-2 !py-1 text-xs" onClick={() => onTransition(q, "in_progress", nextStation)}>
                      → {titleCase(nextStation)}
                    </button>
                  )}
                  <button className="btn-primary !px-2 !py-1 text-xs" onClick={() => onTransition(q, "completed")}>
                    Complete
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AddToQueue({ patients, onDone }: { patients: Patient[]; onDone: () => void }) {
  const { actor } = useSession();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Patient | null>(null);
  const [service, setService] = useState<QueueService>("general");
  const [priority, setPriority] = useState<QueuePriority>("normal");
  const [busy, setBusy] = useState(false);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return patients.slice(0, 8);
    return patients
      .filter((p) => displayName(p).toLowerCase().includes(q) || p.phone_primary.includes(q) || p.mrn.toLowerCase().includes(q))
      .slice(0, 8);
  }, [patients, query]);

  async function add() {
    if (!actor || !selected) return;
    setBusy(true);
    try {
      const entry = createRecord<QueueEntry>(actor, {
        patient_id: selected.id,
        queue_date: toISODate(new Date()),
        service,
        station: "registration",
        status: "waiting",
        priority,
        checked_in_at: new Date().toISOString(),
      });
      await saveRecord(db.queueEntries, entry, actor, "create");
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {!selected ? (
        <>
          <input className="input" placeholder="Search patient…" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
          <div className="max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
            {results.map((p) => (
              <button key={p.id} onClick={() => setSelected(p)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50">
                <span className="font-medium text-slate-800">{displayName(p)}</span>
                <span className="text-xs text-slate-400">{patientAge(p.date_of_birth)} · {p.phone_primary}</span>
              </button>
            ))}
            {results.length === 0 && <p className="px-3 py-4 text-center text-sm text-slate-400">No matches</p>}
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between rounded-lg bg-brand-50 px-3 py-2">
            <span className="font-medium text-brand-800">{displayName(selected)}</span>
            <button className="text-xs text-brand-700 hover:underline" onClick={() => setSelected(null)}>
              change
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Service">
              <select className="input" value={service} onChange={(e) => setService(e.target.value as QueueService)}>
                <option value="general">General</option>
                <option value="anc">ANC</option>
                <option value="immunization">Immunization</option>
                <option value="pnc">PNC</option>
                <option value="other">Other</option>
              </select>
            </Field>
            <Field label="Priority / triage">
              <select className="input" value={priority} onChange={(e) => setPriority(e.target.value as QueuePriority)}>
                <option value="normal">Normal</option>
                <option value="priority">Priority</option>
                <option value="emergency">Emergency</option>
              </select>
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={onDone}>Cancel</button>
            <button className="btn-primary" onClick={add} disabled={busy}>
              {busy ? "Adding…" : "Add to queue"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

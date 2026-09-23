import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  nationalFacilityCode,
  shortFacilityCode,
  facilityArea,
  type Permission,
} from "@phc/shared";
import { db } from "../db/db";
import { SmsAdmin } from "../components/SmsAdmin";
import { smsEnabled } from "../lib/deployment";
import { StaffAdmin } from "../components/StaffAdmin";
import { AuditLog } from "../components/AuditLog";
import { ConflictQueue } from "../components/ConflictQueue";
import { MergeTool } from "../components/MergeTool";
import { ScheduleEditor } from "../components/ScheduleEditor";
import { createRecord, saveRecord } from "../db/repository";
import { useSession } from "../lib/session";
import { getDeviceId } from "../lib/device";
import { useSync } from "../lib/sync";
import { Badge, Field, Modal, PageHeader, StatCard } from "../components/ui";
import { relativeTime } from "../lib/format";
import type { Facility } from "../db/types";

type Tab = { key: string; label: string; perm: Permission };
const TABS: Tab[] = [
  { key: "facilities", label: "Facilities", perm: "facility.manage" },
  { key: "staff", label: "Staff", perm: "staff.manage" },
  { key: "config", label: "Schedules", perm: "schedule.edit" },
  // SMS is listed only when the deployment has it switched on; see
  // lib/deployment.ts. A tab for a feature that cannot send is worse than none.
  { key: "sms", label: "SMS", perm: "sms.send" },
  { key: "duplicates", label: "Duplicates", perm: "patient.merge" },
  { key: "audit", label: "Audit log", perm: "audit.view" },
  { key: "health", label: "Sync & health", perm: "sync.health.view" },
];

export function AdminPage() {
  const { can } = useSession();
  const available = TABS.filter(
    (t) => can(t.perm) && (t.key !== "sms" || smsEnabled()),
  );
  const [tab, setTab] = useState(available[0]?.key ?? "facilities");

  if (available.length === 0) {
    return (
      <div className="py-20 text-center text-slate-400">
        You don’t have administrative permissions.
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Admin dashboard" subtitle="Facilities, staff, configuration, audit & system health" />
      <div className="mb-5 flex flex-wrap gap-1 border-b border-slate-200">
        {available.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              tab === t.key
                ? "border-brand-700 text-brand-800"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "facilities" && <FacilitiesTab />}
      {tab === "staff" && <StaffTab />}
      {tab === "config" && <ConfigTab />}
      {tab === "sms" && <SmsAdmin />}
      {tab === "duplicates" && <MergeTool />}
      {tab === "audit" && <AuditTab />}
      {tab === "health" && <HealthTab />}
    </div>
  );
}

function FacilitiesTab() {
  const { actor } = useSession();
  const facilities = useLiveQuery(() => db.facilities.toArray(), [], []);
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({
    number: "",
    name: "",
    facility_type: "primary" as "primary" | "secondary",
    ownership: "public" as "public" | "private",
    ward: "",
    phone: "",
  });

  async function add() {
    if (!actor || !form.number || !form.name) return;
    const entry = {
      number: form.number.padStart(4, "0"),
      name: form.name,
      facilityType: form.facility_type,
      ownership: form.ownership,
    };
    const fac = createRecord<Facility>(actor, {
      code: shortFacilityCode(entry),
      name: form.name,
      type: form.facility_type === "secondary" ? "referral" : "phc",
      facility_type: form.facility_type,
      ownership: form.ownership,
      national_code: nationalFacilityCode(entry),
      facility_number: entry.number,
      ward: form.ward || facilityArea(form.name),
      town: "Nnewi",
      lga: "Nnewi North",
      state: "Anambra",
      contact_phone: form.phone,
      active: true,
    });
    await saveRecord(db.facilities, fac, actor, "create");
    setShow(false);
    setForm({ number: "", name: "", facility_type: "primary", ownership: "public", ward: "", phone: "" });
  }

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <button className="btn-primary" onClick={() => setShow(true)}>Add facility</button>
      </div>
      <div className="card divide-y divide-slate-100">
        {facilities.filter((f) => !f.deleted_at).map((f) => (
          <div key={f.id} className="flex items-center justify-between px-4 py-3">
            <div>
              <div className="font-semibold text-slate-800">{f.name}</div>
              <div className="text-xs text-slate-400">
                <span className="font-mono">{f.national_code ?? f.code}</span> ·{" "}
                {[f.ward, f.town].filter(Boolean).join(", ")} · {f.facility_type ?? "—"}/
                {f.ownership ?? "—"}
              </div>
            </div>
            <Badge tone={f.active ? "green" : "slate"}>{f.active ? "active" : "inactive"}</Badge>
          </div>
        ))}
      </div>
      <Modal open={show} title="Add facility" onClose={() => setShow(false)}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name" required><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Facility number" required><input className="input" value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} placeholder="0131" /></Field>
            <Field label="Facility type">
              <select className="input" value={form.facility_type} onChange={(e) => setForm({ ...form, facility_type: e.target.value as "primary" | "secondary" })}>
                <option value="primary">Primary</option>
                <option value="secondary">Secondary</option>
              </select>
            </Field>
            <Field label="Ownership">
              <select className="input" value={form.ownership} onChange={(e) => setForm({ ...form, ownership: e.target.value as "public" | "private" })}>
                <option value="public">Public</option>
                <option value="private">Private</option>
              </select>
            </Field>
            <Field label="Ward / area"><input className="input" value={form.ward} onChange={(e) => setForm({ ...form, ward: e.target.value })} /></Field>
            <Field label="Contact phone"><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setShow(false)}>Cancel</button>
            <button className="btn-primary" onClick={add}>Add</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function StaffTab() {
  return <StaffAdmin />;
}
function ConfigTab() {
  const { can } = useSession();
  return <ScheduleEditor canEdit={can("schedule.edit")} />;
}
function AuditTab() {
  return <AuditLog />;
}
function HealthTab() {
  const sync = useSync();
  const outboxTotal = useLiveQuery(() => db.outbox.count(), [], 0);
  const acked = useLiveQuery(() => db.outbox.where("status").equals("acked").count(), [], 0);

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Connection" value={sync.online ? "Online" : "Offline"} tone={sync.online ? "good" : "default"} />
        <StatCard label="Pending changes" value={sync.pending} tone={sync.pending ? "warn" : "default"} />
        <StatCard label="Conflicts" value={sync.conflicts} tone={sync.conflicts ? "alert" : "default"} />
        <StatCard label="Last sync" value={relativeTime(sync.lastSyncAt)} />
      </div>
      <div className="card mt-4 p-4 text-sm">
        <h3 className="mb-2 font-semibold text-slate-700">Device & outbox</h3>
        <dl className="space-y-1.5">
          <div className="flex justify-between"><dt className="text-slate-400">Device ID</dt><dd className="font-mono text-xs text-slate-600">{getDeviceId()}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-400">Outbox entries (total)</dt><dd className="text-slate-700">{outboxTotal}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-400">Acked (synced)</dt><dd className="text-slate-700">{acked}</dd></div>
        </dl>
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
          Writes land in the local outbox first. When the sync hub is reachable, a cycle pushes
          them and pulls back what other devices recorded; with no hub, work simply accumulates
          here until there is one.
        </p>
      </div>
      <ConflictQueue />
    </div>
  );
}

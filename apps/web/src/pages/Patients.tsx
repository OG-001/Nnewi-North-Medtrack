import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db/db";
import { useScope, notDeleted } from "../lib/scope";
import { useSession } from "../lib/session";
import { PageHeader, Modal, Badge, EmptyState, Avatar } from "../components/ui";
import { PatientForm } from "../components/PatientForm";
import { IconPlus, IconSearch, IconPhone } from "../components/icons";
import { displayName, patientAge, initials, titleCase } from "../lib/format";
import type { Patient } from "../db/types";

export function PatientsPage() {
  const { can } = useSession();
  const scope = useScope();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [showRegister, setShowRegister] = useState(false);

  const patients = useLiveQuery(() => db.patients.toArray(), [], []);
  const inScope = useMemo(() => notDeleted(patients).filter(scope.inScope), [patients, scope]);

  // Fast local search by phone / name / MRN (Module 1 acceptance: < 300ms).
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? inScope.filter(
          (p) =>
            p.phone_primary.toLowerCase().includes(q) ||
            displayName(p).toLowerCase().includes(q) ||
            p.mrn.toLowerCase().includes(q),
        )
      : inScope;
    return [...list].sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [inScope, query]);

  function open(p: Patient) {
    navigate(`/patients/${p.id}`);
  }

  return (
    <div>
      <PageHeader
        title="Patients"
        subtitle={`${inScope.length} registered in scope`}
        actions={
          can("patient.register") && (
            <button className="btn-primary" onClick={() => setShowRegister(true)}>
              <IconPlus width={16} height={16} /> Register patient
            </button>
          )
        }
      />

      <div className="relative mb-4">
        <IconSearch className="pointer-events-none absolute left-3 top-2.5 text-slate-400" width={18} height={18} />
        <input
          className="input pl-10"
          placeholder="Search by phone, name, or MRN…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
      </div>

      {results.length === 0 ? (
        <EmptyState
          title={query ? "No matching patients" : "No patients yet"}
          hint={query ? "Try a different phone, name, or MRN." : "Register the first patient to get started."}
          action={
            can("patient.register") && (
              <button className="btn-primary" onClick={() => setShowRegister(true)}>
                <IconPlus width={16} height={16} /> Register patient
              </button>
            )
          }
        />
      ) : (
        <div className="card divide-y divide-slate-100">
          {results.map((p) => (
            <button
              key={p.id}
              onClick={() => open(p)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"
            >
              <Avatar initials={initials(p)} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-semibold text-slate-800">{displayName(p)}</span>
                  {p.category_tags.map((t) => (
                    <Badge key={t} tone="green">
                      {titleCase(t)}
                    </Badge>
                  ))}
                  {p.status !== "active" && <Badge tone="slate">{p.status}</Badge>}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-slate-500">
                  <span>{patientAge(p.date_of_birth)} · {titleCase(p.sex)}</span>
                  {p.phone_primary && (
                    <span className="inline-flex items-center gap-1">
                      <IconPhone width={12} height={12} /> {p.phone_primary}
                    </span>
                  )}
                  <span className="font-mono text-[11px] text-slate-400">{p.mrn}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      <Modal open={showRegister} title="Register new patient" onClose={() => setShowRegister(false)} wide>
        <PatientForm
          allPatients={patients}
          onCancel={() => setShowRegister(false)}
          onCreated={(p) => {
            setShowRegister(false);
            navigate(`/patients/${p.id}`);
          }}
        />
      </Modal>
    </div>
  );
}

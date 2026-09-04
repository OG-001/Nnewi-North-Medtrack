/**
 * Editing the immunization schedule and the ANC contact model.
 *
 * These are configuration, not code (Global Constraint 9): when NPHCDA guidance
 * changes, an administrator must be able to follow it without waiting for a
 * release. They are also the values that decide when a child is due a vaccine,
 * so every edit is validated with the same schema the hub uses, and rejected
 * here with the reason rather than saved and discovered later in a due list.
 *
 * The hub is authoritative, so editing requires connectivity. Devices read the
 * result and cache it for offline use.
 */
import { useEffect, useState } from "react";
import {
  ANC_MODEL_LABELS,
  validateConfig,
  type AncModelConfig,
  type AncModelItem,
  type ImmunizationSchedule,
  type ImmunizationScheduleItem,
} from "@phc/shared";
import { Badge } from "./ui";
import { useSync } from "../lib/sync";
import { hasHubSession } from "../lib/api";
import {
  getAncModelConfig,
  getImmunizationSchedule,
  refreshConfigFromHub,
  saveConfigToHub,
} from "../lib/clinical-config";

type Problem = { field: string; issue: string };

function ageDays(days: number): string {
  if (days === 0) return "At birth";
  if (days < 30) return `${Math.round(days / 7)} weeks`;
  if (days < 365) return `${Math.round(days / 30.44)} months`;
  return `${(days / 365).toFixed(1)} years`;
}

export function ScheduleEditor({ canEdit }: { canEdit: boolean }) {
  const sync = useSync();
  const online = sync.online && hasHubSession();

  const [schedule, setSchedule] = useState<ImmunizationSchedule>(getImmunizationSchedule());
  const [anc, setAnc] = useState<AncModelConfig>(getAncModelConfig());
  const [problems, setProblems] = useState<Problem[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState<"epi" | "anc" | null>(null);

  useEffect(() => {
    if (!online) return;
    void refreshConfigFromHub().then((ok) => {
      if (!ok) return;
      setSchedule(getImmunizationSchedule());
      setAnc(getAncModelConfig());
    });
  }, [online]);

  function updateDose(index: number, patch: Partial<ImmunizationScheduleItem>) {
    setSchedule((prev) => ({
      ...prev,
      items: prev.items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    }));
    setDirty("epi");
    setStatus(null);
  }

  function updateContact(index: number, patch: Partial<AncModelItem>) {
    setAnc((prev) => ({
      ...prev,
      items: prev.items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    }));
    setDirty("anc");
    setStatus(null);
  }

  async function save(key: "immunization_schedule" | "anc_model") {
    const value = key === "immunization_schedule" ? schedule : anc;

    // Validate before the request, so an obvious mistake is caught without a
    // round trip. The hub validates again, because it is the authority.
    const result = validateConfig(key, value);
    if (!result.ok) {
      setProblems(result.issues);
      setStatus(null);
      return;
    }

    setBusy(true);
    setProblems([]);
    try {
      const saved = await saveConfigToHub(key, value);
      setStatus(`Saved. Now at version ${saved.version}.`);
      setDirty(null);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Could not save to the sync hub");
    } finally {
      setBusy(false);
    }
  }

  const disabled = !canEdit || !online || busy;

  return (
    <div className="space-y-5">
      {!online && (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-xs text-amber-800">
          Clinical schedules are held by the sync hub, so editing them needs a connection. The
          schedule shown below is the one this device is currently using, and it keeps working
          offline.
        </p>
      )}

      {problems.length > 0 && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-xs text-red-700">
          <p className="font-semibold">This change was not saved:</p>
          <ul className="mt-1 list-disc pl-4">
            {problems.map((p, i) => (
              <li key={i}>
                <span className="font-mono">{p.field}</span>: {p.issue}
              </li>
            ))}
          </ul>
        </div>
      )}

      {status && <p className="rounded-lg bg-brand-50 px-4 py-3 text-xs text-brand-800">{status}</p>}

      {/* ---- Immunization schedule ---- */}
      <div className="card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-700">Immunization (EPI) schedule</h3>
          <div className="flex items-center gap-2">
            <Badge tone="amber">verify vs. current NPHCDA (Q2)</Badge>
            {canEdit && (
              <button
                className="btn-primary !py-1 !text-xs"
                disabled={disabled || dirty !== "epi"}
                onClick={() => void save("immunization_schedule")}
              >
                {busy ? "Saving…" : "Save schedule"}
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">Dose</th>
                <th className="px-3 py-2 text-left">Antigen</th>
                <th className="px-3 py-2 text-left">Recommended age (days)</th>
                <th className="px-3 py-2 text-left">Minimum age</th>
                <th className="px-3 py-2 text-left">Grace window</th>
                <th className="px-3 py-2 text-left">Reads as</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {schedule.items.map((item, index) => (
                <tr key={item.id}>
                  <td className="px-3 py-1.5 font-medium text-slate-700">{item.doseLabel}</td>
                  <td className="px-3 py-1.5 uppercase text-slate-500">{item.antigen}</td>
                  <td className="px-3 py-1.5">
                    <input
                      className="input !w-24 !py-1 !text-sm"
                      type="number"
                      min={0}
                      value={item.recommendedAgeDays}
                      disabled={disabled}
                      aria-label={`${item.doseLabel} recommended age in days`}
                      onChange={(e) =>
                        updateDose(index, { recommendedAgeDays: Number(e.target.value) })
                      }
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      className="input !w-24 !py-1 !text-sm"
                      type="number"
                      min={0}
                      value={item.minAgeDays}
                      disabled={disabled}
                      aria-label={`${item.doseLabel} minimum age in days`}
                      onChange={(e) => updateDose(index, { minAgeDays: Number(e.target.value) })}
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      className="input !w-20 !py-1 !text-sm"
                      type="number"
                      min={0}
                      value={item.windowDays}
                      disabled={disabled}
                      aria-label={`${item.doseLabel} grace window in days`}
                      onChange={(e) => updateDose(index, { windowDays: Number(e.target.value) })}
                    />
                  </td>
                  <td className="px-3 py-1.5 text-slate-500">{ageDays(item.recommendedAgeDays)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Changing a due age affects children scheduled from now on. Doses already recorded are
          not altered.
        </p>
      </div>

      {/* ---- ANC contact model ---- */}
      <div className="card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-700">
            ANC contact model &middot; {ANC_MODEL_LABELS[anc.model]}
          </h3>
          {canEdit && (
            <button
              className="btn-primary !py-1 !text-xs"
              disabled={disabled || dirty !== "anc"}
              onClick={() => void save("anc_model")}
            >
              {busy ? "Saving…" : "Save ANC model"}
            </button>
          )}
        </div>

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">Contact</th>
                <th className="px-3 py-2 text-left">Target gestational age (weeks)</th>
                <th className="px-3 py-2 text-left">Window (weeks)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {anc.items.map((item, index) => (
                <tr key={item.contactNumber}>
                  <td className="px-3 py-1.5 font-medium text-slate-700">
                    Contact {item.contactNumber}
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      className="input !w-24 !py-1 !text-sm"
                      type="number"
                      min={1}
                      max={45}
                      value={item.targetGaWeeks}
                      disabled={disabled}
                      aria-label={`Contact ${item.contactNumber} target gestational age`}
                      onChange={(e) =>
                        updateContact(index, { targetGaWeeks: Number(e.target.value) })
                      }
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      className="input !w-20 !py-1 !text-sm"
                      type="number"
                      min={0}
                      max={8}
                      value={item.windowWeeks}
                      disabled={disabled}
                      aria-label={`Contact ${item.contactNumber} window`}
                      onChange={(e) => updateContact(index, { windowWeeks: Number(e.target.value) })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

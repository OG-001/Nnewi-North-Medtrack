import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { APP_CONFIG } from "@phc/shared";
import { db } from "../db/db";
import { useSession } from "../lib/session";
import type { Facility } from "../db/types";

type Ownership = "public" | "private";
type FacType = "primary" | "secondary";

export function FacilitySelectPage() {
  const { selectFacility } = useSession();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [owners, setOwners] = useState<Set<Ownership>>(new Set());
  const [types, setTypes] = useState<Set<FacType>>(new Set());
  const [menuOpen, setMenuOpen] = useState(false);
  const activeCount = owners.size + types.size;

  const facilities = useLiveQuery(() => db.facilities.toArray(), [], []);

  const active = useMemo(
    () => facilities.filter((f) => !f.deleted_at && f.active),
    [facilities],
  );

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return active
      .filter((f) => owners.size === 0 || (f.ownership ? owners.has(f.ownership) : false))
      .filter((f) => types.size === 0 || (f.facility_type ? types.has(f.facility_type) : false))
      .filter(
        (f) =>
          !q ||
          f.name.toLowerCase().includes(q) ||
          (f.national_code ?? "").toLowerCase().includes(q) ||
          (f.ward ?? "").toLowerCase().includes(q),
      )
      .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
  }, [active, query, owners, types]);

  // An option is "available" only if combining it with the OTHER dimension's
  // current selection still yields at least one facility. Unavailable options are
  // shown faint + unclickable so the user knows the combination is impossible
  // before selecting it.
  function ownerCount(o: Ownership): number {
    return active.filter(
      (f) =>
        f.ownership === o && (types.size === 0 || (f.facility_type ? types.has(f.facility_type) : false)),
    ).length;
  }
  function typeCount(t: FacType): number {
    return active.filter(
      (f) =>
        f.facility_type === t && (owners.size === 0 || (f.ownership ? owners.has(f.ownership) : false)),
    ).length;
  }

  function choose(f: Facility) {
    selectFacility(f.id);
    navigate("/login");
  }

  function clearAll() {
    setOwners(new Set());
    setTypes(new Set());
    setMenuOpen(false);
  }

  function toggleOwner(o: Ownership) {
    setOwners((prev) => {
      const next = new Set(prev);
      if (next.has(o)) next.delete(o);
      else next.add(o);
      return next;
    });
  }

  function toggleType(t: FacType) {
    setTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }

  return (
    <div className="min-h-full bg-brand-900">
      <div className="mx-auto w-full max-w-3xl px-4 py-8">
        <div className="mb-6 text-center text-white">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 text-3xl">
            ✚
          </div>
          <h1 className="text-xl font-bold">{APP_CONFIG.shortName}</h1>
          <p className="text-sm text-brand-100/80">{APP_CONFIG.name}</p>
        </div>

        <div className="card p-4 sm:p-6">
          <h2 className="text-lg font-semibold text-slate-800">Select your health facility</h2>
          <p className="mt-1 text-sm text-slate-500">
            Choose your PHC in {APP_CONFIG.lga} LGA to continue to sign-in. You will only see and
            record data for the facility you select.
          </p>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              className="input flex-1"
              placeholder="Search facility name, code or area…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={clearAll}
                className={
                  activeCount === 0
                    ? "rounded-lg bg-brand-700 px-3 py-1.5 text-sm font-medium text-white"
                    : "rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
                }
              >
                All
              </button>

              {/* Filter funnel + dropdown */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-label="Filter facilities"
                  aria-expanded={menuOpen}
                  className={
                    activeCount > 0
                      ? "flex items-center gap-1 rounded-lg border border-brand-300 bg-brand-50 px-2.5 py-1.5 text-sm font-medium text-brand-800"
                      : "flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
                  }
                >
                  <FunnelIcon />
                  {activeCount > 0 && (
                    <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-700 px-1 text-[10px] font-semibold text-white">
                      {activeCount}
                    </span>
                  )}
                </button>

                {menuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                    <div className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-slate-200 bg-white p-1.5 shadow-lg">
                      <p className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        Ownership
                      </p>
                      <FilterItem
                        label="Public"
                        checked={owners.has("public")}
                        disabled={
                          !owners.has("public") &&
                          (owners.has("private") || ownerCount("public") === 0)
                        }
                        onClick={() => toggleOwner("public")}
                      />
                      <FilterItem
                        label="Private"
                        checked={owners.has("private")}
                        disabled={
                          !owners.has("private") &&
                          (owners.has("public") || ownerCount("private") === 0)
                        }
                        onClick={() => toggleOwner("private")}
                      />
                      <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        Facility type
                      </p>
                      <FilterItem
                        label="Primary"
                        checked={types.has("primary")}
                        disabled={
                          !types.has("primary") &&
                          (types.has("secondary") || typeCount("primary") === 0)
                        }
                        onClick={() => toggleType("primary")}
                      />
                      <FilterItem
                        label="Secondary"
                        checked={types.has("secondary")}
                        disabled={
                          !types.has("secondary") &&
                          (types.has("primary") || typeCount("secondary") === 0)
                        }
                        onClick={() => toggleType("secondary")}
                      />
                      {activeCount > 0 && (
                        <button
                          type="button"
                          onClick={clearAll}
                          className="mt-1 w-full rounded-md border-t border-slate-100 px-2 py-1.5 text-left text-xs text-slate-500 hover:bg-slate-50"
                        >
                          Clear filters
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="mt-2 text-xs text-slate-400">
            {list.length} {list.length === 1 ? "facility" : "facilities"}
          </div>

          <div className="mt-2 max-h-[26rem] divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-100">
            {list.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => choose(f)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-brand-50"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium text-slate-800">{f.name}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
                    <span className="font-mono">{f.national_code ?? f.code}</span>
                    <span>·</span>
                    <span className="capitalize">{f.facility_type ?? "—"}</span>
                    <span
                      className={
                        f.ownership === "public"
                          ? "rounded bg-brand-100 px-1.5 py-0.5 font-medium text-brand-800"
                          : "rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-500"
                      }
                    >
                      {f.ownership ?? "—"}
                    </span>
                  </div>
                </div>
                <span className="shrink-0 text-brand-700">→</span>
              </button>
            ))}
            {list.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-slate-400">
                No facilities match your search or filters.
              </div>
            )}
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-brand-100/60">
          Works offline · {APP_CONFIG.complianceBaseline} · Data stays in {APP_CONFIG.country}
        </p>
      </div>
    </div>
  );
}

function FilterItem({
  label,
  checked,
  disabled,
  onClick,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  // Faint + unclickable when its sibling in the same group is already selected
  // (the two would cancel each other out) or no facility matches the combination.
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? "Cannot combine with the current selection" : undefined}
      className={
        disabled
          ? "flex w-full cursor-not-allowed items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-slate-300"
          : "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50"
      }
    >
      <span
        className={
          checked
            ? "flex h-4 w-4 items-center justify-center rounded border border-brand-700 bg-brand-700 text-[10px] text-white"
            : disabled
              ? "flex h-4 w-4 items-center justify-center rounded border border-slate-200 text-transparent"
              : "flex h-4 w-4 items-center justify-center rounded border border-slate-300 text-transparent"
        }
      >
        ✓
      </span>
      <span className="flex-1">{label}</span>
    </button>
  );
}

function FunnelIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
    </svg>
  );
}

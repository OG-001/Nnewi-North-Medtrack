import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { APP_CONFIG, ROLE_LABELS } from "@phc/shared";
import { db } from "../db/db";
import { useSession } from "../lib/session";
import type { UserAccount } from "../db/types";

// Known demo PINs (prefill only — real auth is the backend, Phase 1).
const DEMO_PINS: Record<string, string> = {
  clerk: "1111",
  nurse: "2222",
  chew: "3333",
  doctor: "4444",
  admin: "5555",
  lga: "6666",
  sysadmin: "0000",
};

export function LoginPage() {
  const { login, selectedFacilityId, clearFacility } = useSession();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const facility = useLiveQuery(
    () => (selectedFacilityId ? db.facilities.get(selectedFacilityId) : undefined),
    [selectedFacilityId],
  );
  // Demo accounts available at the selected facility.
  const accounts = useLiveQuery(
    () =>
      selectedFacilityId
        ? db.users
            .filter((u) => u.status === "active" && u.facility_ids.includes(selectedFacilityId))
            .toArray()
        : Promise.resolve([] as UserAccount[]),
    [selectedFacilityId],
    [] as UserAccount[],
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await login(username, pin);
    setBusy(false);
    if (res.ok) navigate("/");
    else setError(res.error ?? "Login failed.");
  }

  function quick(u: string) {
    setUsername(u);
    setPin(DEMO_PINS[u] ?? "");
    setError(null);
  }

  function changeFacility() {
    clearFacility();
    navigate("/");
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-brand-900 p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center text-white">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 text-3xl">
            ✚
          </div>
          <h1 className="text-xl font-bold">{APP_CONFIG.shortName}</h1>
          <p className="text-sm text-brand-100/80">{APP_CONFIG.name}</p>
        </div>

        <div className="card p-6">
          {/* Selected facility banner */}
          <div className="mb-4 flex items-start justify-between gap-3 rounded-lg bg-brand-50 px-3 py-2.5">
            <div className="min-w-0">
              <div className="text-[11px] font-medium uppercase tracking-wide text-brand-700">
                Signing in to
              </div>
              <div className="truncate text-sm font-semibold text-slate-800">
                {facility?.name ?? "…"}
              </div>
              {facility?.national_code && (
                <div className="font-mono text-[11px] text-slate-400">{facility.national_code}</div>
              )}
            </div>
            <button
              type="button"
              onClick={changeFacility}
              className="shrink-0 text-xs font-medium text-brand-700 hover:underline"
            >
              Change PHC
            </button>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="label">Username</label>
              <input
                className="input"
                value={username}
                autoCapitalize="none"
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. nurse"
              />
            </div>
            <div>
              <label className="label">PIN</label>
              <input
                className="input tracking-[0.4em]"
                type="password"
                inputMode="numeric"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="••••"
                autoFocus
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" className="btn-primary w-full" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <div className="mt-6 border-t border-slate-100 pt-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
              Accounts at this facility (PIN pre-fills)
            </p>
            {accounts.length === 0 ? (
              <p className="text-xs text-slate-400">
                No staff accounts are provisioned for this facility yet. An administrator must add
                them before clinical sign-in is possible.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {accounts
                  .slice()
                  .sort((a, b) => a.username.localeCompare(b.username))
                  .map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => quick(a.username)}
                      className="rounded-lg border border-slate-200 px-2 py-1.5 text-left text-xs hover:border-brand-300 hover:bg-brand-50"
                    >
                      <div className="font-semibold text-slate-700">{a.username}</div>
                      <div className="text-[10px] text-slate-400">
                        {a.roles.map((r) => ROLE_LABELS[r]).join(", ")}
                      </div>
                    </button>
                  ))}
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

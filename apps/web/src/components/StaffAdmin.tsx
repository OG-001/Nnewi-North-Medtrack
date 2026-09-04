/**
 * Staff administration against the hub.
 *
 * This deliberately requires connectivity. Staff accounts live at the hub, and
 * an account created only on one device cannot sign in anywhere else. More
 * importantly, disabling a staff member has to revoke their access rather than
 * relabel a local row, and only the hub can do that.
 *
 * Offline, the current roster is still shown so an administrator can see who is
 * provisioned; the actions are simply unavailable.
 */
import { useCallback, useEffect, useState } from "react";
import { ROLES, ROLE_LABELS, type Role } from "@phc/shared";
import { Badge, Modal } from "./ui";
import { useSession } from "../lib/session";
import { useSync } from "../lib/sync";
import { hasHubSession } from "../lib/api";
import {
  createStaff,
  listStaff,
  resetStaffPin,
  updateStaff,
  type HubStaff,
} from "../lib/admin-api";

const CROSS_FACILITY_ROLES: Role[] = ["lga_authority", "system_admin"];

export function StaffAdmin() {
  const { user, facilityId, roles } = useSession();
  const sync = useSync();
  const online = sync.online && hasHubSession();
  const isSystemAdmin = roles.includes("system_admin");

  const [staff, setStaff] = useState<HubStaff[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [resetting, setResetting] = useState<HubStaff | null>(null);
  const [newPin, setNewPin] = useState("");

  const [form, setForm] = useState({
    full_name: "",
    username: "",
    pin: "",
    phone: "",
    roles: ["records_clerk"] as Role[],
  });

  const load = useCallback(async () => {
    if (!online) return;
    setError(null);
    try {
      setStaff(await listStaff());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reach the sync hub");
    }
  }, [online]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act<T>(key: string, fn: () => Promise<T>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      await load();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not work");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function submitNew() {
    if (!facilityId) return;
    const ok = await act("create", () =>
      createStaff({
        full_name: form.full_name.trim(),
        username: form.username.trim().toLowerCase(),
        pin: form.pin,
        phone: form.phone.trim() || undefined,
        roles: form.roles,
        facility_ids: [facilityId],
      }),
    );
    if (ok) {
      setShowAdd(false);
      setForm({ full_name: "", username: "", pin: "", phone: "", roles: ["records_clerk"] });
    }
  }

  if (!online) {
    return (
      <div className="card p-4 text-sm">
        <h3 className="font-semibold text-slate-700">Staff</h3>
        <p className="mt-1 text-xs text-slate-500">
          Staff accounts live at the sync hub, so adding someone, changing a role, or disabling an
          account needs a connection. Disabling an account has to revoke access everywhere, which
          only the hub can do.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          {staff ? `${staff.length} provisioned at this facility` : "Loading…"}
        </p>
        <button className="btn-primary !py-1 !text-xs" onClick={() => setShowAdd(true)}>
          Add staff member
        </button>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}

      <div className="card divide-y divide-slate-100">
        {(staff ?? []).map((member) => (
          <div key={member.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <div className="min-w-0">
              <div className="font-semibold text-slate-800">{member.full_name}</div>
              <div className="text-xs text-slate-400">
                @{member.username} · {member.roles.map((r) => ROLE_LABELS[r]).join(", ")}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge
                tone={
                  member.status === "active" ? "green" : member.status === "disabled" ? "red" : "amber"
                }
              >
                {member.status}
              </Badge>
              <button
                className="btn-secondary !px-2 !py-1 text-xs"
                disabled={busy !== null}
                onClick={() => setResetting(member)}
              >
                Reset PIN
              </button>
              {member.id !== user?.id && (
                <button
                  className={member.status === "active" ? "btn-danger !px-2 !py-1 text-xs" : "btn-secondary !px-2 !py-1 text-xs"}
                  disabled={busy !== null}
                  onClick={() =>
                    void act(member.id, () =>
                      updateStaff(member.id, {
                        status: member.status === "active" ? "disabled" : "active",
                      }),
                    )
                  }
                >
                  {member.status === "active" ? "Disable" : "Re-enable"}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <Modal open={showAdd} title="Add staff member" onClose={() => setShowAdd(false)}>
        <div className="space-y-3">
          <label className="block">
            <span className="label">Full name</span>
            <input
              className="input"
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            />
          </label>
          <label className="block">
            <span className="label">Username</span>
            <input
              className="input"
              value={form.username}
              placeholder="lowercase, no spaces"
              onChange={(e) => setForm({ ...form, username: e.target.value })}
            />
          </label>
          <label className="block">
            <span className="label">Starting PIN (4 to 6 digits)</span>
            <input
              className="input tracking-[0.3em]"
              inputMode="numeric"
              value={form.pin}
              onChange={(e) => setForm({ ...form, pin: e.target.value })}
            />
            <span className="mt-1 block text-xs text-slate-500">
              They should change it after their first sign-in. Obvious PINs are refused.
            </span>
          </label>
          <label className="block">
            <span className="label">Phone (optional)</span>
            <input
              className="input"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </label>
          <div>
            <span className="label">Roles</span>
            <div className="mt-1 grid grid-cols-2 gap-1">
              {ROLES.map((role) => {
                const elevated = CROSS_FACILITY_ROLES.includes(role);
                const disabled = elevated && !isSystemAdmin;
                return (
                  <label
                    key={role}
                    className={`flex items-center gap-2 text-xs ${disabled ? "text-slate-300" : "text-slate-700"}`}
                    title={disabled ? "Only a system administrator may grant this role" : undefined}
                  >
                    <input
                      type="checkbox"
                      disabled={disabled}
                      checked={form.roles.includes(role)}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          roles: e.target.checked
                            ? [...form.roles, role]
                            : form.roles.filter((r) => r !== role),
                        })
                      }
                    />
                    {ROLE_LABELS[role]}
                  </label>
                );
              })}
            </div>
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setShowAdd(false)}>
              Cancel
            </button>
            <button
              className="btn-primary"
              disabled={busy !== null || !form.full_name || !form.username || !form.pin}
              onClick={() => void submitNew()}
            >
              {busy === "create" ? "Creating…" : "Create account"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={!!resetting} title={`Reset PIN for ${resetting?.full_name ?? ""}`} onClose={() => setResetting(null)}>
        <div className="space-y-3">
          <p className="text-xs text-slate-500">
            This signs them out everywhere and they will need the new PIN to sign back in.
          </p>
          <label className="block">
            <span className="label">New PIN</span>
            <input
              className="input tracking-[0.3em]"
              inputMode="numeric"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value)}
            />
          </label>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setResetting(null)}>
              Cancel
            </button>
            <button
              className="btn-primary"
              disabled={busy !== null || newPin.length < 4}
              onClick={async () => {
                const ok = await act("reset", () => resetStaffPin(resetting!.id, newPin));
                if (ok) {
                  setResetting(null);
                  setNewPin("");
                }
              }}
            >
              {busy === "reset" ? "Resetting…" : "Reset PIN"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

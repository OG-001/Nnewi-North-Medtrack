/**
 * Session/auth context. Local auth (username + PIN) against the on-device users
 * table gets staff into the app with no network at all; when a sync hub is
 * reachable a hub session is established alongside it (see hub-session.ts), and
 * that is what authorises sync. Offline-aware:
 * the chosen facility + user persist in localStorage so a previously-used device
 * can re-open while offline (user-roles §5).
 *
 * Facility-first flow: the user selects their PHC at the door (selectedFacilityId)
 * BEFORE the sign-in screen. Login is then scoped to that facility — a staff
 * member can only authenticate against an account provisioned for the selected
 * facility (oversight roles excepted). This is the first line of cross-facility
 * isolation; data-scope filtering (lib/scope.ts) and the hub's server-side sync
 * scope are the others.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { can as canRole, type Permission, type Role } from "@phc/shared";
import { db } from "../db/db";
import type { Actor } from "../db/repository";
import type { UserAccount } from "../db/types";
import { newId } from "@phc/shared";
import { getDeviceId } from "./device";
import { endHubSession, establishHubSession, primeClinicalConfig } from "./hub-session";
import { getWithdrawnPermissions } from "./clinical-config";
import { loadDeployment } from "./deployment";

interface SessionValue {
  user: UserAccount | null;
  /** PHC chosen at the door (gates the sign-in screen). */
  selectedFacilityId: string | null;
  /** Active facility for data scope once signed in. */
  facilityId: string | null;
  actor: Actor | null;
  roles: Role[];
  selectFacility: (facilityId: string) => void;
  clearFacility: () => void;
  login: (username: string, pin: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
  setFacility: (facilityId: string) => void;
  can: (permission: Permission) => boolean;
}

const SessionContext = createContext<SessionValue | null>(null);

const LS_USER = "phc-track.session_user";
const LS_FAC = "phc-track.session_facility";
const LS_SELECTED_FAC = "phc-track.selected_facility";

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserAccount | null>(null);
  const [facilityId, setFacilityId] = useState<string | null>(null);
  const [selectedFacilityId, setSelectedFacilityId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      // Load the cached clinical schedule first: an offline device must still
      // schedule against the configured schedule, not only the built-in one.
      await primeClinicalConfig();
      void loadDeployment();

      const savedSelected = localStorage.getItem(LS_SELECTED_FAC);
      if (savedSelected) {
        const f = await db.facilities.get(savedSelected);
        if (f && f.active) setSelectedFacilityId(savedSelected);
      }
      const savedUserId = localStorage.getItem(LS_USER);
      const savedFac = localStorage.getItem(LS_FAC);
      if (savedUserId) {
        const u = await db.users.get(savedUserId);
        if (u && u.status === "active") {
          setUser(u);
          setFacilityId(savedFac && u.facility_ids.includes(savedFac) ? savedFac : u.facility_ids[0]);
        }
      }
      setReady(true);
    })();
  }, []);

  const selectFacility = useCallback((fid: string) => {
    setSelectedFacilityId(fid);
    localStorage.setItem(LS_SELECTED_FAC, fid);
  }, []);

  const clearFacility = useCallback(() => {
    setSelectedFacilityId(null);
    localStorage.removeItem(LS_SELECTED_FAC);
  }, []);

  const login = useCallback(
    async (username: string, pin: string) => {
      if (!selectedFacilityId) return { ok: false, error: "Select a facility first." };
      const uname = username.trim().toLowerCase();
      const candidates = await db.users.where("username").equals(uname).toArray();
      // Scope to the selected facility: the account must be provisioned for it.
      const u = candidates.find((c) => c.facility_ids.includes(selectedFacilityId));
      if (!u) {
        return candidates.length
          ? { ok: false, error: "That account is not provisioned for this facility." }
          : { ok: false, error: "Unknown username." };
      }
      if (u.status !== "active") return { ok: false, error: "Account is not active." };
      if (u.pin !== pin) return { ok: false, error: "Incorrect PIN." };
      setUser(u);
      setFacilityId(selectedFacilityId);
      localStorage.setItem(LS_USER, u.id);
      localStorage.setItem(LS_FAC, selectedFacilityId);
      await db.users.update(u.id, { last_login_at: new Date().toISOString() });
      await db.auditEvents.add({
        id: newId(),
        actor_user_id: u.id,
        action: "login",
        entity_type: "user_account",
        entity_id: u.id,
        facility_id: selectedFacilityId,
        at: new Date().toISOString(),
        device_id: getDeviceId(),
      });

      // Best-effort: pick up a hub session so this device can sync. Deliberately
      // not awaited — sign-in must not wait on the network (offline-sync §1).
      void establishHubSession(uname, pin, selectedFacilityId);

      return { ok: true };
    },
    [selectedFacilityId],
  );

  const logout = useCallback(() => {
    setUser(null);
    setFacilityId(null);
    localStorage.removeItem(LS_USER);
    void endHubSession();
    // selectedFacilityId is kept so logout returns to the same facility's sign-in.
  }, []);

  const setFacility = useCallback((fid: string) => {
    setFacilityId(fid);
    localStorage.setItem(LS_FAC, fid);
  }, []);

  const value = useMemo<SessionValue>(() => {
    const roles = user?.roles ?? [];
    const actor: Actor | null = user && facilityId ? { userId: user.id, facilityId } : null;
    return {
      user,
      selectedFacilityId,
      facilityId,
      actor,
      roles,
      selectFacility,
      clearFacility,
      login,
      logout,
      setFacility,
      // A facility may withdraw a permission from a role, never add one, so the
      // withdrawal is applied on top of the role matrix (rbac-and-scope §3).
      can: (permission: Permission) =>
        canRole(roles, permission, getWithdrawnPermissions(facilityId, roles)),
    };
  }, [user, selectedFacilityId, facilityId, selectFacility, clearFacility, login, logout, setFacility]);

  if (!ready) return null;
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}

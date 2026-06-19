import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { APP_CONFIG, ROLE_LABELS, type Permission } from "@phc/shared";
import { useSession } from "../lib/session";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db/db";
import { SyncStatusIndicator } from "./SyncStatusIndicator";
import { Avatar } from "./ui";
import {
  IconDashboard,
  IconUsers,
  IconQueue,
  IconMaternal,
  IconSyringe,
  IconReport,
  IconEye,
  IconSettings,
  IconLogout,
} from "./icons";

interface NavItem {
  to: string;
  label: string;
  icon: typeof IconDashboard;
  perm?: Permission;
}

const NAV: NavItem[] = [
  { to: "/", label: "Dashboard", icon: IconDashboard },
  { to: "/patients", label: "Patients", icon: IconUsers, perm: "patient.read" },
  { to: "/queue", label: "Queue", icon: IconQueue, perm: "queue.manage" },
  { to: "/maternal", label: "Maternal / ANC", icon: IconMaternal, perm: "anc.manage" },
  { to: "/immunization", label: "Immunization", icon: IconSyringe, perm: "immunization.record" },
  { to: "/reports", label: "Reports", icon: IconReport, perm: "report.view" },
  { to: "/oversight", label: "LGA Oversight", icon: IconEye, perm: "report.lga" },
  { to: "/admin", label: "Admin", icon: IconSettings, perm: "facility.manage" },
];

export function AppShell() {
  const { user, roles, facilityId, setFacility, logout, can } = useSession();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const facilities = useLiveQuery(() => db.facilities.toArray(), [], []);
  const myFacilities = facilities.filter(
    (f) => user?.facility_ids.includes(f.id) || roles.includes("lga_authority") || roles.includes("system_admin"),
  );
  const currentFacility = facilities.find((f) => f.id === facilityId);

  const visibleNav = NAV.filter((n) => !n.perm || can(n.perm) || n.to === "/");

  function onLogout() {
    logout();
    navigate("/login");
  }

  const sidebar = (
    <div className="flex h-full flex-col bg-brand-900 text-white">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 text-lg font-bold">
          ✚
        </div>
        <div>
          <div className="text-sm font-bold leading-tight">{APP_CONFIG.shortName}</div>
          <div className="text-[11px] text-brand-100/70">{APP_CONFIG.lga} LGA</div>
        </div>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-2">
        {visibleNav.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) => `nav-link ${isActive ? "nav-link-active" : ""}`}
            >
              <Icon width={18} height={18} />
              {item.label}
            </NavLink>
          );
        })}
      </nav>
      <div className="border-t border-white/10 px-4 py-3 text-[11px] text-brand-100/60">
        {APP_CONFIG.complianceBaseline} · Patient data stays in {APP_CONFIG.country}
      </div>
    </div>
  );

  return (
    <div className="flex h-full">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 lg:block">{sidebar}</aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setMobileOpen(false)}>
          <div className="absolute inset-0 bg-slate-900/50" />
          <div className="absolute left-0 top-0 h-full w-60" onClick={(e) => e.stopPropagation()}>
            {sidebar}
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
          <button
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            ☰
          </button>
          <div className="min-w-0 flex-1">
            <select
              className="max-w-[14rem] truncate rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-medium text-slate-700 focus:border-brand-500 focus:outline-none"
              value={facilityId ?? ""}
              onChange={(e) => setFacility(e.target.value)}
            >
              {myFacilities.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} ({f.code})
                </option>
              ))}
            </select>
            {currentFacility && (
              <span className="ml-2 hidden font-mono text-xs text-slate-400 sm:inline">
                {currentFacility.national_code ?? currentFacility.code}
              </span>
            )}
          </div>
          <SyncStatusIndicator />
          <div className="flex items-center gap-2">
            <div className="hidden text-right sm:block">
              <div className="text-sm font-semibold leading-tight text-slate-800">
                {user?.full_name}
              </div>
              <div className="text-[11px] text-slate-400">
                {roles.map((r) => ROLE_LABELS[r]).join(", ")}
              </div>
            </div>
            <Avatar
              initials={(user?.full_name ?? "?")
                .split(" ")
                .map((s) => s[0])
                .slice(0, 2)
                .join("")}
            />
            <button
              onClick={onLogout}
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              title="Log out"
            >
              <IconLogout width={18} height={18} />
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto bg-slate-50 px-4 py-6 sm:px-6">
          <div className="mx-auto max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

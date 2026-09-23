/**
 * What this deployment is and what it has switched on.
 *
 * Read from the hub's public compliance endpoint and cached, so an offline
 * device still knows whether SMS is available rather than offering a button
 * that cannot work. Carries no patient data.
 */
import { useEffect, useState } from "react";
import { API_BASE_URL } from "./api";

export interface DeploymentInfo {
  controller: string;
  dpo: { name: string; contact: string };
  residency: { country: string; note: string };
  retention: {
    general_years: number;
    maternity_years: number;
    child_until_age: number;
    backup_days: number;
    note: string;
  };
  features: { sms_enabled: boolean };
  legal_basis: string;
}

const CACHE_KEY = "phc-track.deployment";

/**
 * SMS is off unless the hub says otherwise. Defaulting to off is the safe
 * direction: a device that has never reached a hub offers no send button,
 * rather than one that fails or, worse, bills for a message.
 */
const FALLBACK: DeploymentInfo = {
  controller: "Not yet designated",
  dpo: { name: "Not yet designated", contact: "Not yet designated" },
  residency: { country: "Nigeria", note: "Self-hosted in Nigeria." },
  retention: {
    general_years: 10,
    maternity_years: 25,
    child_until_age: 18,
    backup_days: 30,
    note: "Retention governs archival review, not automatic deletion.",
  },
  features: { sms_enabled: false },
  legal_basis: "Nigeria Data Protection Act 2023",
};

let current: DeploymentInfo = FALLBACK;
const listeners = new Set<() => void>();

export function getDeployment(): DeploymentInfo {
  return current;
}

export function smsEnabled(): boolean {
  return current.features.sms_enabled;
}

/** Load the cached copy, then refresh from the hub in the background. */
export async function loadDeployment(): Promise<DeploymentInfo> {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) current = { ...FALLBACK, ...(JSON.parse(cached) as DeploymentInfo) };
  } catch {
    // A bad cache is never fatal: the fallback is always valid.
  }
  for (const l of listeners) l();

  try {
    const res = await fetch(`${API_BASE_URL}/system/compliance`);
    if (res.ok) {
      current = (await res.json()) as DeploymentInfo;
      localStorage.setItem(CACHE_KEY, JSON.stringify(current));
      for (const l of listeners) l();
    }
  } catch {
    // Offline, or no hub. Keep whatever was cached.
  }
  return current;
}

export function useDeployment(): DeploymentInfo {
  const [value, setValue] = useState(current);
  useEffect(() => {
    const listener = () => setValue(getDeployment());
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return value;
}

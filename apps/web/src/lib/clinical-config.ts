/**
 * Clinical configuration on the device: the immunization schedule and the ANC
 * contact model (Global Constraint 9).
 *
 * The hub is authoritative, but a clinic must schedule correctly with no
 * network, so the config is cached in the local store and read from there.
 * Precedence is: cached hub config, then the shipped defaults. A device that has
 * never reached a hub still schedules children against the seed schedule.
 *
 * Config is deliberately NOT synced through the outbox. It is hub-authoritative,
 * so it flows one way (offline-sync-design section 5).
 */
import { useEffect, useState } from "react";
import {
  DEFAULT_CLINICAL_CONFIG,
  validateConfig,
  type AncModelConfig,
  type AppClinicalConfig,
  type ConfigKey,
  type ImmunizationSchedule,
} from "@phc/shared";
import { db } from "../db/db";
import { apiFetch, hasHubSession } from "./api";

const CACHE_KEY = "clinical_config";

interface CachedConfig {
  key: string;
  config: AppClinicalConfig;
  versions: Record<string, number>;
  fetchedAt: string;
}

/** In-memory copy so scheduling never awaits IndexedDB on a hot path. */
let current: AppClinicalConfig = DEFAULT_CLINICAL_CONFIG;
let loaded = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function getClinicalConfig(): AppClinicalConfig {
  return current;
}

export function getImmunizationSchedule(): ImmunizationSchedule {
  return current.immunization_schedule;
}

export function getAncModelConfig(): AncModelConfig {
  return current.anc_model;
}

/** Load the cached config from the device. Safe to call repeatedly. */
export async function loadCachedConfig(): Promise<AppClinicalConfig> {
  if (loaded) return current;
  try {
    const row = (await db.syncMeta.get(CACHE_KEY)) as unknown as CachedConfig | undefined;
    if (row?.config) {
      // Validate what came off the device: a cache written by an older build,
      // or corrupted, must not silently mis-schedule anyone.
      const merged = { ...DEFAULT_CLINICAL_CONFIG };
      for (const key of Object.keys(row.config) as ConfigKey[]) {
        const result = validateConfig(key, row.config[key]);
        if (result.ok) merged[key] = result.value as never;
      }
      current = merged;
    }
  } catch {
    // A cache read failure is never fatal: the defaults are always valid.
  }
  loaded = true;
  emit();
  return current;
}

/**
 * Fetch config from the hub and cache it. Best-effort: an unreachable hub
 * leaves the device on its cached or default config.
 */
export async function refreshConfigFromHub(): Promise<boolean> {
  if (!hasHubSession()) return false;
  try {
    const res = await apiFetch<{
      config: AppClinicalConfig;
      versions: Record<string, number>;
    }>("/config");

    const merged = { ...DEFAULT_CLINICAL_CONFIG };
    for (const key of Object.keys(res.config ?? {}) as ConfigKey[]) {
      const result = validateConfig(key, res.config[key]);
      if (result.ok) merged[key] = result.value as never;
    }

    current = merged;
    loaded = true;
    await db.syncMeta.put({
      key: CACHE_KEY,
      config: merged,
      versions: res.versions,
      fetchedAt: new Date().toISOString(),
    } as never);
    emit();
    return true;
  } catch {
    return false;
  }
}

/** Save config to the hub. Admin only; the hub enforces that and validates. */
export async function saveConfigToHub(key: ConfigKey, value: unknown) {
  const saved = await apiFetch<{ key: string; version: number }>(`/config/${key}`, {
    method: "PUT",
    body: JSON.stringify({ value }),
  });
  await refreshConfigFromHub();
  return saved;
}

/** Re-render a component when the active config changes. */
export function useClinicalConfig(): AppClinicalConfig {
  const [value, setValue] = useState(current);
  useEffect(() => {
    const listener = () => setValue(getClinicalConfig());
    listeners.add(listener);
    void loadCachedConfig();
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return value;
}

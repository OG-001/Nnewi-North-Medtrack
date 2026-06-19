import { newId } from "@phc/shared";

const KEY = "phc-track.device_id";

/** Stable per-browser device id (sync diagnostics / origin_device_id). */
export function getDeviceId(): string {
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = newId();
    localStorage.setItem(KEY, id);
  }
  return id;
}

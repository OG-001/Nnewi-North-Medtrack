/**
 * Client-generated identity (offline-sync-design §1.2, data-model §2, §6).
 * UUIDs are the canonical key; the MRN is the human-facing, offline-safe,
 * facility-prefixed identifier printed on cards.
 */

/** Client-generated UUID v4 (offline-safe, collision-free before reaching hub). */
export function newId(): string {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }
  // Fallback (older environments) — RFC4122-ish.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const BASE32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford-ish, no I/L/O/U

function shortRandomFromUuid(uuid: string): string {
  // Take 4 base32-ish chars derived from the UUID's entropy.
  const hex = uuid.replace(/[^0-9a-f]/gi, "").slice(0, 8);
  const n = parseInt(hex || "0", 16) >>> 0;
  let out = "";
  let v = n;
  for (let i = 0; i < 4; i++) {
    out += BASE32[v % 32];
    v = Math.floor(v / 32);
  }
  return out;
}

function dayOfYear(d: Date): number {
  const start = Date.UTC(d.getUTCFullYear(), 0, 0);
  const diff = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - start;
  return Math.floor(diff / 86_400_000);
}

/**
 * Offline-safe MRN: `<FACILITY_CODE>-<YY><DDD>-<SHORT_RANDOM>`
 * e.g. NNW07-26159-4F3A  (data-model.md §6).
 */
export function generateMrn(
  facilityCode: string,
  recordId: string,
  when: Date = new Date(),
): string {
  const yy = String(when.getUTCFullYear()).slice(-2);
  const ddd = String(dayOfYear(when)).padStart(3, "0");
  return `${facilityCode}-${yy}${ddd}-${shortRandomFromUuid(recordId)}`;
}

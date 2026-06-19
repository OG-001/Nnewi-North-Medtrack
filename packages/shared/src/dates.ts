/**
 * Shared date utilities. EDD/gestational-age live here as a single source of
 * truth (data-model §3.5 explicitly requires one shared utility).
 */

export const MS_PER_DAY = 86_400_000;

/** Parse a YYYY-MM-DD string as a UTC date (no timezone drift). */
export function parseISODate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
}

/** Format a Date as YYYY-MM-DD (UTC). */
export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * MS_PER_DAY);
}

export function diffDays(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / MS_PER_DAY);
}

/**
 * Estimated Date of Delivery by Naegele's rule: EDD = LMP + 280 days
 * (data-model §3.5).
 */
export function computeEdd(lmp: Date): Date {
  return addDays(lmp, 280);
}

/** Completed weeks of gestation from LMP as of `asOf` (default today). */
export function gestationalAgeWeeks(lmp: Date, asOf: Date = new Date()): number {
  const days = diffDays(asOf, lmp);
  return Math.max(0, Math.floor(days / 7));
}

/** Age in completed years as of `asOf`. */
export function ageYears(dob: Date, asOf: Date = new Date()): number {
  let age = asOf.getUTCFullYear() - dob.getUTCFullYear();
  const m = asOf.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && asOf.getUTCDate() < dob.getUTCDate())) age--;
  return Math.max(0, age);
}

/** Age in completed days. */
export function ageDays(dob: Date, asOf: Date = new Date()): number {
  return Math.max(0, diffDays(asOf, dob));
}

/** Human age label e.g. "8 mo", "3 yr", "12 days". */
export function ageLabel(dob: Date, asOf: Date = new Date()): string {
  const days = ageDays(dob, asOf);
  if (days < 60) return `${days} day${days === 1 ? "" : "s"}`;
  const months = Math.floor(days / 30.44);
  if (months < 24) return `${months} mo`;
  return `${ageYears(dob, asOf)} yr`;
}

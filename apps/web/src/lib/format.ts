/**
 * Display helpers.
 *
 * These are deliberately tolerant of missing fields. They render rows that came
 * from another device, and a record that arrives incomplete must degrade to a
 * dash rather than throwing: one bad row should never blank an entire clinic
 * screen. The names are typed as optional for the same reason.
 */
import { ageLabel, parseISODate } from "@phc/shared";

interface NameParts {
  first_name?: string | null;
  last_name?: string | null;
  other_names?: string | null;
}

export function fullName(p: NameParts): string {
  return [p.last_name, p.first_name, p.other_names].filter(Boolean).join(" ") || "Unnamed record";
}

export function displayName(p: NameParts): string {
  return [p.first_name, p.last_name].filter(Boolean).join(" ") || "Unnamed record";
}

export function patientAge(dob: string | null | undefined): string {
  if (!dob) return "—";
  const parsed = parseISODate(dob);
  if (Number.isNaN(parsed.getTime())) return "—";
  return ageLabel(parsed);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-NG", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-NG", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return `${Math.round(hrs / 24)} d ago`;
}

export function initials(p: NameParts): string {
  const value = `${p.first_name?.[0] ?? ""}${p.last_name?.[0] ?? ""}`.toUpperCase();
  return value || "?";
}

export function titleCase(s: string | null | undefined): string {
  if (!s) return "—";
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Immunization (EPI) schedule — editable config, not code (master-plan §7.7).
 * Default seed schedule per data-model §4.1, flagged "verify against current
 * NPHCDA" (Open question Q2). The engine computes a per-child due schedule from
 * the child's date of birth.
 */
import type { Antigen, DoseStatus } from "./enums";
import { addDays } from "./dates";

export interface ImmunizationScheduleItem {
  id: string;
  antigen: Antigen;
  doseLabel: string; // e.g. "Penta 1"
  recommendedAgeDays: number;
  minAgeDays: number;
  windowDays: number; // grace window after recommended age
  order: number;
}

export interface ImmunizationSchedule {
  id: string;
  name: string;
  source: "NPHCDA" | "WHO" | "custom";
  /** Flag carried into the UI so staff know to verify (Q2). */
  verifyAgainstCurrentGuidance: boolean;
  items: ImmunizationScheduleItem[];
}

const WEEK = 7;

/** Default representative Nigerian routine-immunization schedule (data-model §4.1). */
export const DEFAULT_EPI_SCHEDULE: ImmunizationSchedule = {
  id: "seed-epi-nphcda",
  name: "Nigeria EPI (routine) — seed",
  source: "NPHCDA",
  verifyAgainstCurrentGuidance: true,
  items: [
    // At birth
    item("bcg", "BCG", 0, 0, 1),
    item("opv", "OPV 0", 0, 0, 2),
    item("hepb", "HepB birth dose", 0, 0, 3),
    // 6 weeks
    item("penta", "Penta 1", 6 * WEEK, 6 * WEEK, 4),
    item("opv", "OPV 1", 6 * WEEK, 6 * WEEK, 5),
    item("pcv", "PCV 1", 6 * WEEK, 6 * WEEK, 6),
    item("rota", "Rotavirus 1", 6 * WEEK, 6 * WEEK, 7),
    // 10 weeks
    item("penta", "Penta 2", 10 * WEEK, 10 * WEEK, 8),
    item("opv", "OPV 2", 10 * WEEK, 10 * WEEK, 9),
    item("pcv", "PCV 2", 10 * WEEK, 10 * WEEK, 10),
    item("rota", "Rotavirus 2", 10 * WEEK, 10 * WEEK, 11),
    // 14 weeks
    item("penta", "Penta 3", 14 * WEEK, 14 * WEEK, 12),
    item("opv", "OPV 3", 14 * WEEK, 14 * WEEK, 13),
    item("pcv", "PCV 3", 14 * WEEK, 14 * WEEK, 14),
    item("rota", "Rotavirus 3", 14 * WEEK, 14 * WEEK, 15),
    item("ipv", "IPV 1", 14 * WEEK, 14 * WEEK, 16),
    // 9 months (≈274 days)
    item("measles", "Measles 1 (MCV1)", 274, 270, 17),
    item("yellow_fever", "Yellow Fever", 274, 270, 18),
    item("men_a", "Meningitis A", 274, 270, 19),
    item("vitamin_a", "Vitamin A", 274, 270, 20),
    // 15 months (≈456 days)
    item("measles", "Measles 2 (MCV2)", 456, 450, 21),
  ],
};

function item(
  antigen: Antigen,
  doseLabel: string,
  recommendedAgeDays: number,
  minAgeDays: number,
  order: number,
): ImmunizationScheduleItem {
  return {
    id: `seed-${order}-${doseLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    antigen,
    doseLabel,
    recommendedAgeDays,
    minAgeDays,
    windowDays: 0,
    order,
  };
}

export interface ComputedDose {
  scheduleItemId: string;
  antigen: Antigen;
  doseLabel: string;
  dueDate: Date;
  recommendedAgeDays: number;
}

/**
 * Compute a child's due dates from DOB + schedule. Includes catch-up: a child
 * presenting late still gets every outstanding dose listed (module 4 acceptance).
 */
export function computeChildSchedule(
  dob: Date,
  schedule: ImmunizationSchedule = DEFAULT_EPI_SCHEDULE,
): ComputedDose[] {
  return [...schedule.items]
    .sort((a, b) => a.order - b.order)
    .map((it) => ({
      scheduleItemId: it.id,
      antigen: it.antigen,
      doseLabel: it.doseLabel,
      dueDate: addDays(dob, it.recommendedAgeDays),
      recommendedAgeDays: it.recommendedAgeDays,
    }));
}

/** Derived display status for a dose given today's date. */
export function doseDisplayStatus(
  recorded: DoseStatus,
  dueDate: Date,
  asOf: Date = new Date(),
): "given" | "due" | "overdue" | "upcoming" | "not_applicable" {
  if (recorded === "given") return "given";
  if (recorded === "not_applicable") return "not_applicable";
  const dueMs = dueDate.getTime();
  const today = asOf.getTime();
  if (today >= dueMs) return "overdue";
  // Within 14 days of due => "due" soon, else upcoming.
  if (dueMs - today <= 14 * MS) return "due";
  return "upcoming";
}
const MS = 86_400_000;

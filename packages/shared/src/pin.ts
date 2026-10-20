/**
 * The one definition of what a PIN may be.
 *
 * WHY THIS FILE EXISTS. The rule was written three times and the three
 * disagreed: the login endpoint accepted 4 to 12 characters of any kind, staff
 * creation accepted only 4 to 6 digits, and the break-glass bootstrap script
 * demanded 8 to 12. The account created by the script could therefore never
 * have been created through the admin screen that account was using, and a
 * reader had no way to know which rule applied where. Worse, nothing surfaced
 * the mismatch: it showed up as an opaque 400 from a form.
 *
 * There are genuinely two different policies here, and one input bound. That is
 * deliberate layering, not drift, so it is written down in one place:
 *
 *   STAFF        a clinic PIN, typed many times a day on a shared tablet,
 *                sometimes with gloves. Numeric and short, by design.
 *   BREAK GLASS  the first administrator, which reaches every facility in the
 *                LGA. Long, and not something anyone types daily.
 *   LOGIN        not a policy at all. A sanity bound on input that MUST accept
 *                anything the two policies above can create, or an account
 *                becomes impossible to sign in with.
 *
 * Changing a bound here changes it everywhere. That is the point.
 */
import { z } from "zod";

/** PINs an attacker tries first, so they are worth nothing. */
export const WEAK_PINS = ["0000", "1111", "1234", "123456", "000000"] as const;

export const STAFF_PIN_MIN_DIGITS = 4;
export const STAFF_PIN_MAX_DIGITS = 6;

export const BREAK_GLASS_PIN_MIN = 8;
export const BREAK_GLASS_PIN_MAX = 12;

/**
 * Login must accept every credential the system can issue. Derived from the two
 * policies rather than written by hand, so widening one cannot lock anybody out.
 */
export const LOGIN_PIN_MIN = Math.min(STAFF_PIN_MIN_DIGITS, BREAK_GLASS_PIN_MIN);
export const LOGIN_PIN_MAX = Math.max(STAFF_PIN_MAX_DIGITS, BREAK_GLASS_PIN_MAX);

/** Shown next to a PIN field, so the rule is visible before anything is typed. */
export const STAFF_PIN_HINT = `${STAFF_PIN_MIN_DIGITS} to ${STAFF_PIN_MAX_DIGITS} digits`;

/**
 * Why this PIN is not acceptable, phrased for the person typing it, or null when
 * it is fine.
 *
 * Returns ONE problem, the most useful one, rather than a list. Someone who has
 * typed four letters needs to know digits are required; telling them the length
 * is also wrong adds nothing. Used by the client so the feedback arrives as the
 * field is filled in, and by the server message so both say the same thing.
 */
export function describeStaffPinProblem(pin: string): string | null {
  if (pin.length === 0) return "Enter a PIN.";
  if (!/^\d+$/.test(pin)) return `PIN must be digits only, ${STAFF_PIN_HINT}.`;
  if (pin.length < STAFF_PIN_MIN_DIGITS) {
    return `PIN is too short. It must be ${STAFF_PIN_HINT}.`;
  }
  if (pin.length > STAFF_PIN_MAX_DIGITS) {
    return `PIN is too long. It must be ${STAFF_PIN_HINT}.`;
  }
  if ((WEAK_PINS as readonly string[]).includes(pin)) {
    return "That PIN is too easily guessed. Choose something less obvious.";
  }
  if (/^(\d)\1+$/.test(pin)) {
    return "A PIN of one repeated digit is too easily guessed.";
  }
  return null;
}

/** A clinic PIN, set when an account is created or its PIN is reset. */
export const staffPinSchema = z.string().superRefine((pin, ctx) => {
  const problem = describeStaffPinProblem(pin);
  if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem });
});

/** The first administrator's PIN. Long, because it reaches every facility. */
export const breakGlassPinSchema = z
  .string()
  .min(BREAK_GLASS_PIN_MIN, `Must be at least ${BREAK_GLASS_PIN_MIN} characters.`)
  .max(BREAK_GLASS_PIN_MAX, `Must be at most ${BREAK_GLASS_PIN_MAX} characters.`)
  .refine((pin) => !(WEAK_PINS as readonly string[]).includes(pin), {
    message: "That PIN is too easily guessed.",
  });

/**
 * Login input bound. Deliberately permissive: it is not the place to enforce
 * policy, because rejecting a credential the system itself issued locks a user
 * out of their own account and looks like a wrong PIN.
 */
export const loginPinSchema = z.string().min(LOGIN_PIN_MIN).max(LOGIN_PIN_MAX);

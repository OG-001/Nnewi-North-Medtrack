/**
 * Sends one recall message to a defaulting patient, from the list where a CHEW
 * is already looking at that patient.
 *
 * The consent decision belongs to the hub, which is the single place it is
 * enforced. This button reports what the hub decided, including a refusal, so a
 * health worker is never left thinking a message went out when it did not.
 */
import { useState } from "react";
import type { Patient } from "../db/types";
import { sendReminder, smsAvailable } from "../lib/sms-api";
import { newId, type SmsTemplateKey } from "@phc/shared";
import { useSession } from "../lib/session";
import { useSync } from "../lib/sync";

type Outcome =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent" }
  | { kind: "refused"; reason: string }
  | { kind: "error"; message: string };

const REFUSAL_LABELS: Record<string, string> = {
  no_consent: "No SMS consent on file",
  no_valid_phone: "No valid phone number",
  patient_inactive: "Record is not active",
};

export function SendReminderButton({
  patient,
  templateKey,
  dueDate,
}: {
  patient: Patient | undefined;
  templateKey: SmsTemplateKey;
  dueDate?: string;
}) {
  const { can } = useSession();
  const sync = useSync();
  const [outcome, setOutcome] = useState<Outcome>({ kind: "idle" });
  // Fixed for this button instance, so a double click cannot send twice.
  const [messageId] = useState(() => newId());

  if (!patient || !can("sms.send")) return null;

  // Give the reason up front rather than letting the nurse press a dead button.
  if (!patient.sms_consent) {
    return <span className="text-xs text-slate-400">No SMS consent</span>;
  }
  if (!sync.online || !smsAvailable()) {
    return <span className="text-xs text-slate-400">SMS needs a connection</span>;
  }

  async function send() {
    setOutcome({ kind: "sending" });
    try {
      const result = await sendReminder({
        patientId: patient!.id,
        templateKey,
        fields: dueDate ? { date: dueDate } : undefined,
        messageId,
      });
      if (result.status === "skipped_no_consent") {
        setOutcome({
          kind: "refused",
          reason: REFUSAL_LABELS[result.skippedReason ?? ""] ?? "Not permitted",
        });
      } else if (result.status === "failed") {
        setOutcome({ kind: "error", message: "Provider rejected the message" });
      } else {
        setOutcome({ kind: "sent" });
      }
    } catch (err) {
      setOutcome({ kind: "error", message: err instanceof Error ? err.message : "Send failed" });
    }
  }

  if (outcome.kind === "sent") return <span className="text-xs text-brand-700">Reminder sent</span>;
  if (outcome.kind === "refused") return <span className="text-xs text-amber-700">{outcome.reason}</span>;

  return (
    <span className="flex items-center gap-2">
      <button
        className="btn-secondary !px-2 !py-1 text-xs"
        disabled={outcome.kind === "sending"}
        onClick={() => void send()}
      >
        {outcome.kind === "sending" ? "Sending…" : "Send reminder"}
      </button>
      {outcome.kind === "error" && <span className="text-xs text-red-600">{outcome.message}</span>}
    </span>
  );
}

import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  DEFAULT_REMINDER_LEAD_DAYS,
  DEFAULT_SEND_WINDOW,
  withinSendWindow,
} from "@phc/shared";
import { PrismaService } from "../prisma/prisma.service";
import { SmsService } from "./sms.service";
import type { Principal } from "../common/principal";

/**
 * Turns the ANC and immunization due dates already synced from devices into
 * reminders (phase-7 task 4).
 *
 * Two properties matter more than the scheduling itself:
 *
 * - **Idempotence.** Each candidate has a `reminderKey` derived from the
 *   entity and its due date, and that column is unique, so a reminder is sent
 *   at most once per due event no matter how often the scan runs.
 * - **Quiet hours.** A scan outside the send window does nothing rather than
 *   waking patients at night.
 *
 * The scan runs on an interval. The plan names BullMQ for jobs, which becomes
 * worthwhile when dispatch is distributed across workers; a single interval is
 * enough while the hub is one process, and the queue can be introduced behind
 * this same interface.
 */
@Injectable()
export class ReminderScheduler implements OnModuleInit {
  private readonly logger = new Logger("SmsReminders");
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: SmsService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    if (this.config.get("SMS_REMINDERS_ENABLED", "false") !== "true") {
      this.logger.log("Reminder scheduler disabled (set SMS_REMINDERS_ENABLED=true)");
      return;
    }
    const minutes = Number(this.config.get("SMS_REMINDER_SCAN_MINUTES", "60"));
    this.timer = setInterval(() => void this.scan(), minutes * 60_000);
    this.timer.unref?.();
    this.logger.log(`Reminder scheduler running every ${minutes} minutes`);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /**
   * One scan pass. Exposed so it can be triggered by an admin and asserted in
   * a test rather than waiting on the interval.
   */
  async scan(now: Date = new Date()): Promise<{
    scanned: number;
    sent: number;
    skipped: number;
    reason?: string;
  }> {
    if (!withinSendWindow(now.getHours(), DEFAULT_SEND_WINDOW)) {
      return { scanned: 0, sent: 0, skipped: 0, reason: "outside_send_window" };
    }

    const leadDays = Number(
      this.config.get("SMS_REMINDER_LEAD_DAYS", String(DEFAULT_REMINDER_LEAD_DAYS)),
    );
    const target = new Date(now.getTime() + leadDays * 86_400_000);
    const targetDate = target.toISOString().slice(0, 10);

    const candidates = await this.dueOn(targetDate);
    let sent = 0;
    let skipped = 0;

    for (const candidate of candidates) {
      // Unique on reminderKey: the insert is what makes the scan idempotent.
      try {
        await this.prisma.smsMessage.create({
          data: {
            id: candidate.reminderKey,
            reminderKey: candidate.reminderKey,
            patientId: candidate.patientId,
            facilityId: candidate.facilityId,
            templateKey: candidate.templateKey,
            language: "en",
            renderedBody: "",
            toPhone: "",
            status: "queued",
            triggeredBy: "reminder_job",
            scheduledFor: target,
            segments: 0,
          },
        });
      } catch {
        skipped += 1; // already reminded for this due event
        continue;
      }

      // Delete the placeholder and send properly, so the real send owns the id.
      await this.prisma.smsMessage.delete({ where: { id: candidate.reminderKey } });

      const principal: Principal = {
        userId: "system-reminder-job",
        username: "reminder-job",
        roles: ["system_admin"],
        facilityScope: null,
      };

      try {
        const outcome = await this.sms.sendToPatient(principal, {
          patientId: candidate.patientId,
          templateKey: candidate.templateKey,
          fields: { date: candidate.dueDate },
          triggeredBy: "reminder_job",
          messageId: candidate.reminderKey,
        });
        await this.prisma.smsMessage.update({
          where: { id: candidate.reminderKey },
          data: { reminderKey: candidate.reminderKey, scheduledFor: target },
        });
        if (outcome.status === "skipped_no_consent") skipped += 1;
        else sent += 1;
      } catch (err) {
        this.logger.warn(`reminder failed for ${candidate.patientId}: ${(err as Error).message}`);
        skipped += 1;
      }
    }

    this.logger.log(`scan for ${targetDate}: ${candidates.length} due, ${sent} sent, ${skipped} skipped`);
    return { scanned: candidates.length, sent, skipped };
  }


  /** ANC contacts and immunization doses falling due on `date`. */
  private async dueOn(date: string): Promise<
    {
      reminderKey: string;
      patientId: string;
      facilityId: string;
      templateKey: "anc_reminder" | "immunization_reminder";
      dueDate: string;
    }[]
  > {
    const rows = await this.prisma.syncedEntity.findMany({
      where: {
        entityType: { in: ["anc_schedule_item", "immunization_dose"] },
        deletedAt: null,
      },
      take: 5_000,
    });

    const due: {
      reminderKey: string;
      patientId: string;
      facilityId: string;
      templateKey: "anc_reminder" | "immunization_reminder";
      dueDate: string;
    }[] = [];

    for (const row of rows) {
      const payload = row.payload as Record<string, unknown>;
      const status = String(payload.status ?? "");
      // Only outstanding items: a completed contact or a given dose is not due.
      if (status === "completed" || status === "given") continue;

      const isAnc = row.entityType === "anc_schedule_item";
      const rawDue = String((isAnc ? payload.target_date : payload.due_date) ?? "");
      if (rawDue.slice(0, 10) !== date) continue;

      const patientId = String(payload.patient_id ?? "");
      if (!patientId) continue;

      due.push({
        reminderKey: `rem-${row.entityType}-${row.id}-${date}`,
        patientId,
        facilityId: row.facilityId,
        templateKey: isAnc ? "anc_reminder" : "immunization_reminder",
        dueDate: date,
      });
    }
    return due;
  }
}

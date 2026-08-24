import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import {
  DEFAULT_SMS_TEMPLATES,
  SMS_TEMPLATE_KEYS,
  checkSmsGate,
  isSmsTemplateKey,
  renderTemplate,
  segmentCount,
  selectBody,
  validateTemplateBody,
  type Language,
  type MergeFields,
  type SmsStatus,
  type SmsTemplate,
  type SmsTemplateKey,
} from "@phc/shared";
import { PrismaService } from "../prisma/prisma.service";
import { ApiError } from "../common/api-error";
import { inScope, type Principal } from "../common/principal";
import {
  SmsProviderError,
  type SmsProvider,
  type SmsProviderName,
} from "./providers/provider.interface";
import { AfricasTalkingProvider } from "./providers/africastalking.provider";
import { TermiiProvider } from "./providers/termii.provider";

export interface SendOutcome {
  id: string;
  status: SmsStatus;
  skippedReason?: string;
  provider?: SmsProviderName;
}

@Injectable()
export class SmsService {
  private readonly logger = new Logger("Sms");

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly africasTalking: AfricasTalkingProvider,
    private readonly termii: TermiiProvider,
  ) {}

  // ---- Providers ----

  private allProviders(): SmsProvider[] {
    return [this.africasTalking, this.termii];
  }

  providerByName(name: string): SmsProvider | null {
    return this.allProviders().find((p) => p.name === name) ?? null;
  }

  /**
   * Providers in the order they should be tried. `SMS_PROVIDER` names the
   * primary; the rest follow as failover. Unconfigured adapters are skipped
   * rather than failing a send that another provider could carry.
   */
  private failoverChain(): SmsProvider[] {
    const primary = this.config.get<string>("SMS_PROVIDER", "africastalking");
    const ordered = [...this.allProviders()].sort((a, b) =>
      a.name === primary ? -1 : b.name === primary ? 1 : 0,
    );
    return ordered.filter((p) => p.isConfigured());
  }

  // ---- Templates ----

  /** Stored templates layered over the seeded defaults. */
  async templates(): Promise<SmsTemplate[]> {
    const overrides = await this.prisma.smsTemplate.findMany();
    const byKey = new Map(overrides.map((o) => [o.key, o]));

    return SMS_TEMPLATE_KEYS.map((key) => {
      const base = DEFAULT_SMS_TEMPLATES[key];
      const override = byKey.get(key);
      if (!override) return base;
      return {
        key,
        description: override.description || base.description,
        bodies: {
          en: override.bodyEn || base.bodies.en,
          ig: override.bodyIg || base.bodies.ig,
        },
      };
    });
  }

  private async templateFor(key: SmsTemplateKey): Promise<SmsTemplate> {
    return (await this.templates()).find((t) => t.key === key) ?? DEFAULT_SMS_TEMPLATES[key];
  }

  async updateTemplate(
    principal: Principal,
    key: string,
    input: { bodyEn: string; bodyIg: string; description?: string },
  ) {
    if (!isSmsTemplateKey(key)) throw ApiError.notFound(`Unknown template "${key}"`);

    // Validate both variants before either can reach a patient.
    const problems = [
      ...validateTemplateBody(input.bodyEn).map((p) => ({ ...p, field: `en.${p.field}` })),
      ...validateTemplateBody(input.bodyIg).map((p) => ({ ...p, field: `ig.${p.field}` })),
    ];
    if (problems.length) throw ApiError.validation("Template is not valid", problems);

    const saved = await this.prisma.smsTemplate.upsert({
      where: { key },
      create: {
        key,
        bodyEn: input.bodyEn,
        bodyIg: input.bodyIg,
        description: input.description ?? DEFAULT_SMS_TEMPLATES[key].description,
        updatedBy: principal.userId,
      },
      update: {
        bodyEn: input.bodyEn,
        bodyIg: input.bodyIg,
        description: input.description,
        updatedBy: principal.userId,
      },
    });

    await this.prisma.auditEvent.create({
      data: {
        actorUserId: principal.userId,
        action: "sms_template_updated",
        entityType: "sms_template",
        entityId: key,
        details: { key },
      },
    });
    return saved;
  }

  // ---- Sending ----

  /**
   * Compose and dispatch one message to one patient.
   *
   * The consent gate runs before anything else and before any provider is
   * contacted. A blocked send is still recorded, with the reason, so that "why
   * did this patient not get a reminder" is answerable.
   */
  async sendToPatient(
    principal: Principal,
    input: {
      patientId: string;
      templateKey: string;
      fields?: MergeFields;
      triggeredBy?: "reminder_job" | "manual" | "bulk";
      messageId?: string;
    },
  ): Promise<SendOutcome> {
    if (!isSmsTemplateKey(input.templateKey)) {
      throw ApiError.validation(`Unknown template "${input.templateKey}"`);
    }

    const patientRow = await this.prisma.syncedEntity.findUnique({
      where: { entityType_id: { entityType: "patient", id: input.patientId } },
    });
    if (!patientRow || patientRow.deletedAt) throw ApiError.notFound("Patient not found");
    if (!inScope(principal, patientRow.facilityId)) throw ApiError.outOfScope();

    const patient = patientRow.payload as Record<string, unknown>;

    // Idempotency: a send composed offline carries its own id, so a retried
    // dispatch must not message the patient twice.
    const messageId = input.messageId ?? crypto.randomUUID();
    const existing = await this.prisma.smsMessage.findUnique({ where: { id: messageId } });
    if (existing) {
      return { id: existing.id, status: existing.status as SmsStatus };
    }

    const gate = checkSmsGate({
      sms_consent: Boolean(patient.sms_consent),
      phone_primary: patient.phone_primary as string | undefined,
      preferred_language: patient.preferred_language as Language | undefined,
      status: patient.status as string | undefined,
    });

    const template = await this.templateFor(input.templateKey);
    const facility = await this.prisma.facility.findUnique({
      where: { id: patientRow.facilityId },
    });

    if (!gate.allowed) {
      // Recorded, never silently dropped.
      await this.prisma.smsMessage.create({
        data: {
          id: messageId,
          patientId: input.patientId,
          facilityId: patientRow.facilityId,
          templateKey: input.templateKey,
          language: "en",
          renderedBody: "",
          toPhone: "",
          status: "skipped_no_consent",
          skippedReason: gate.reason,
          triggeredBy: input.triggeredBy ?? "manual",
          segments: 0,
        },
      });
      await this.audit(principal, "sms_skipped", messageId, patientRow.facilityId, {
        reason: gate.reason,
        template: input.templateKey,
      });
      return { id: messageId, status: "skipped_no_consent", skippedReason: gate.reason };
    }

    const body = renderTemplate(selectBody(template, gate.language), {
      name: [patient.first_name, patient.last_name].filter(Boolean).join(" "),
      facility: facility?.name ?? "your health centre",
      ...input.fields,
    });

    const created = await this.prisma.smsMessage.create({
      data: {
        id: messageId,
        patientId: input.patientId,
        facilityId: patientRow.facilityId,
        templateKey: input.templateKey,
        language: gate.language,
        renderedBody: body,
        toPhone: gate.to,
        status: "queued",
        triggeredBy: input.triggeredBy ?? "manual",
        segments: segmentCount(body),
      },
    });

    return this.dispatch(principal, created.id, gate.to, body);
  }

  /** Try each configured provider in turn; only a transient error fails over. */
  private async dispatch(
    principal: Principal,
    messageId: string,
    to: string,
    body: string,
  ): Promise<SendOutcome> {
    const chain = this.failoverChain();
    if (chain.length === 0) {
      this.logger.warn("No SMS provider is configured; message left queued");
      return { id: messageId, status: "queued" };
    }

    let lastError: SmsProviderError | null = null;

    for (const provider of chain) {
      try {
        const result = await provider.send({ to, body });
        const updated = await this.prisma.smsMessage.update({
          where: { id: messageId },
          data: {
            status: result.status,
            provider: provider.name,
            providerMessageId: result.providerMessageId,
            sentAt: new Date(),
            failureReason: null,
          },
        });
        await this.audit(principal, "sms_sent", messageId, updated.facilityId, {
          provider: provider.name,
          segments: updated.segments,
        });
        return { id: messageId, status: result.status, provider: provider.name };
      } catch (err) {
        const providerError =
          err instanceof SmsProviderError
            ? err
            : new SmsProviderError((err as Error).message, true, provider.name);
        lastError = providerError;
        this.logger.warn(`${provider.name} send failed: ${providerError.message}`);

        // A permanent rejection will not succeed on another provider either.
        if (!providerError.transient) break;
      }
    }

    const failed = await this.prisma.smsMessage.update({
      where: { id: messageId },
      data: { status: "failed", failureReason: lastError?.message ?? "No provider succeeded" },
    });
    await this.audit(principal, "sms_failed", messageId, failed.facilityId, {
      reason: lastError?.message,
    });
    return { id: messageId, status: "failed" };
  }

  /** Manual or scheduled send to many patients, each individually gated. */
  async sendBulk(
    principal: Principal,
    input: { patientIds: string[]; templateKey: string; fields?: MergeFields },
  ): Promise<{ sent: number; skipped: number; failed: number; results: SendOutcome[] }> {
    const results: SendOutcome[] = [];
    for (const patientId of input.patientIds.slice(0, 500)) {
      try {
        results.push(
          await this.sendToPatient(principal, {
            patientId,
            templateKey: input.templateKey,
            fields: input.fields,
            triggeredBy: "bulk",
          }),
        );
      } catch (err) {
        this.logger.warn(`bulk send skipped ${patientId}: ${(err as Error).message}`);
      }
    }
    return {
      sent: results.filter((r) => r.status === "sent" || r.status === "delivered").length,
      skipped: results.filter((r) => r.status === "skipped_no_consent").length,
      failed: results.filter((r) => r.status === "failed").length,
      results,
    };
  }

  // ---- Delivery callbacks ----

  async applyDeliveryWebhook(
    providerName: string,
    rawBody: string,
    headers: Record<string, string>,
    payload: unknown,
  ) {
    const provider = this.providerByName(providerName);
    if (!provider) throw ApiError.notFound(`Unknown provider "${providerName}"`);

    if (!provider.verifyWebhookSignature(rawBody, headers)) {
      throw ApiError.forbidden("Invalid webhook signature");
    }

    const update = provider.parseDeliveryWebhook(payload);
    if (!update) return { applied: false };

    const message = await this.prisma.smsMessage.findFirst({
      where: { providerMessageId: update.providerMessageId, provider: provider.name },
    });
    if (!message) return { applied: false };

    await this.prisma.smsMessage.update({
      where: { id: message.id },
      data: {
        status: update.status,
        deliveredAt: update.status === "delivered" ? new Date() : message.deliveredAt,
      },
    });
    return { applied: true };
  }

  // ---- Send log ----

  async messages(
    principal: Principal,
    filters: { status?: string; patientId?: string; limit?: number },
  ) {
    return this.prisma.smsMessage.findMany({
      where: {
        ...(principal.facilityScope ? { facilityId: { in: principal.facilityScope } } : {}),
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.patientId ? { patientId: filters.patientId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(filters.limit ?? 100, 500),
    });
  }

  async stats(principal: Principal) {
    const where = principal.facilityScope
      ? { facilityId: { in: principal.facilityScope } }
      : {};
    const grouped = await this.prisma.smsMessage.groupBy({
      by: ["status"],
      where,
      _count: { _all: true },
      _sum: { segments: true },
    });
    return {
      byStatus: Object.fromEntries(grouped.map((g) => [g.status, g._count._all])),
      totalSegments: grouped.reduce((sum, g) => sum + (g._sum.segments ?? 0), 0),
    };
  }

  private audit(
    principal: Principal,
    action: string,
    messageId: string,
    facilityId: string,
    details: Prisma.InputJsonValue,
  ) {
    return this.prisma.auditEvent.create({
      data: {
        actorUserId: principal.userId,
        action,
        entityType: "sms_message",
        entityId: messageId,
        facilityId,
        details,
      },
    });
  }
}

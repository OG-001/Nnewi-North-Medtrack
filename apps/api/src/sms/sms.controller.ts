import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Put,
  Query,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import { SmsService } from "./sms.service";
import {
  bulkSendSchema,
  sendSchema,
  updateTemplateSchema,
  type BulkSendDto,
  type SendDto,
  type UpdateTemplateDto,
} from "./sms.dto";
import { ZodValidationPipe } from "../common/zod.pipe";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Public, Roles } from "../common/decorators/roles.decorator";
import type { Principal } from "../common/principal";

@Controller("sms")
export class SmsController {
  constructor(private readonly sms: SmsService) {}

  @Get("templates")
  templates() {
    return this.sms.templates();
  }

  /** Editing a template is an administrative act (phase 7, task 8). */
  @Roles("facility_admin", "system_admin")
  @Put("templates/:key")
  updateTemplate(
    @CurrentUser() user: Principal,
    @Param("key") key: string,
    @Body(new ZodValidationPipe(updateTemplateSchema)) dto: UpdateTemplateDto,
  ) {
    return this.sms.updateTemplate(user, key, {
      bodyEn: dto.body_en,
      bodyIg: dto.body_ig,
      description: dto.description,
    });
  }

  /** Clinical staff may message their own facility's patients. */
  @Roles("nurse_midwife", "chew", "doctor_mo", "facility_admin", "system_admin")
  @Post("send")
  send(@CurrentUser() user: Principal, @Body(new ZodValidationPipe(sendSchema)) dto: SendDto) {
    return this.sms.sendToPatient(user, {
      patientId: dto.patient_id,
      templateKey: dto.template_key,
      fields: dto.fields,
      messageId: dto.message_id,
      triggeredBy: "manual",
    });
  }

  /** Bulk send is deliberately admin-only. */
  @Roles("facility_admin", "system_admin")
  @Post("send-bulk")
  sendBulk(
    @CurrentUser() user: Principal,
    @Body(new ZodValidationPipe(bulkSendSchema)) dto: BulkSendDto,
  ) {
    return this.sms.sendBulk(user, {
      patientIds: dto.patient_ids,
      templateKey: dto.template_key,
      fields: dto.fields,
    });
  }

  @Get("messages")
  messages(
    @CurrentUser() user: Principal,
    @Query("status") status?: string,
    @Query("patientId") patientId?: string,
    @Query("limit") limit?: string,
  ) {
    return this.sms.messages(user, { status, patientId, limit: Number(limit) || undefined });
  }

  @Get("stats")
  stats(@CurrentUser() user: Principal) {
    return this.sms.stats(user);
  }

  /**
   * Delivery callbacks are public by necessity, so they are signature-verified
   * inside the service and rate-limited globally. An unverified payload is
   * refused and never touches the send log.
   */
  @Public()
  @Post("webhooks/:provider")
  webhook(
    @Param("provider") provider: string,
    @Req() req: Request & { rawBody?: Buffer },
    @Headers() headers: Record<string, string>,
    @Body() payload: unknown,
  ) {
    const raw = req.rawBody ? req.rawBody.toString("utf8") : JSON.stringify(payload ?? {});
    return this.sms.applyDeliveryWebhook(provider, raw, headers, payload);
  }
}

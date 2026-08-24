import { z } from "zod";
import { SMS_TEMPLATE_KEYS } from "@phc/shared";

export const updateTemplateSchema = z.object({
  body_en: z.string().min(1).max(1000),
  body_ig: z.string().min(1).max(1000),
  description: z.string().max(200).optional(),
});

export const sendSchema = z.object({
  patient_id: z.string().min(1),
  template_key: z.enum(SMS_TEMPLATE_KEYS),
  fields: z.record(z.union([z.string(), z.number()])).optional(),
  /** Supplied when the message was composed offline, to keep the send idempotent. */
  message_id: z.string().min(1).optional(),
});

export const bulkSendSchema = z.object({
  patient_ids: z.array(z.string().min(1)).min(1).max(500),
  template_key: z.enum(SMS_TEMPLATE_KEYS),
  fields: z.record(z.union([z.string(), z.number()])).optional(),
});

export type UpdateTemplateDto = z.infer<typeof updateTemplateSchema>;
export type SendDto = z.infer<typeof sendSchema>;
export type BulkSendDto = z.infer<typeof bulkSendSchema>;

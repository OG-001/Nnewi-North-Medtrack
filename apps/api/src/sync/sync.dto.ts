import { z } from "zod";
import { SYNC_PUSH_MAX_BATCH } from "@phc/shared";

export const enrollSchema = z.object({
  device_id: z.string().min(1).max(128),
  label: z.string().max(120).optional(),
});

const pushChangeSchema = z.object({
  entity_type: z.string().min(1),
  entity_id: z.string().min(1),
  op: z.enum(["upsert", "delete"]),
  rev: z.number().int().nonnegative(),
  base_rev: z.number().int().nonnegative(),
  payload: z.record(z.unknown()).nullable(),
  client_ts: z.string(),
});

export const pushSchema = z.object({
  device_id: z.string().min(1),
  changes: z.array(pushChangeSchema).max(SYNC_PUSH_MAX_BATCH),
});

export type EnrollDto = z.infer<typeof enrollSchema>;
export type PushDto = z.infer<typeof pushSchema>;

import { z } from "zod";

export const adjustmentSchema = z.object({
  figure_key: z.string().min(1),
  to_value: z.number().int(),
  reason: z.string().min(3).max(500),
});

export type AdjustmentDto = z.infer<typeof adjustmentSchema>;

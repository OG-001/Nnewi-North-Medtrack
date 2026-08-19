import { z } from "zod";

export const loginSchema = z.object({
  username: z.string().min(1),
  pin: z.string().min(4).max(12),
  facility_id: z.string().min(1),
  device_id: z.string().min(1).optional(),
});

export const refreshSchema = z.object({ refresh_token: z.string().min(1) });

export type LoginDto = z.infer<typeof loginSchema>;
export type RefreshDto = z.infer<typeof refreshSchema>;

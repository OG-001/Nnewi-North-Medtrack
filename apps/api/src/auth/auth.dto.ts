import { z } from "zod";
import { loginPinSchema } from "@phc/shared";

export const loginSchema = z.object({
  username: z.string().min(1),
  // Input bound only, never policy: see packages/shared/src/pin.ts.
  pin: loginPinSchema,
  facility_id: z.string().min(1),
  device_id: z.string().min(1).optional(),
});

export const refreshSchema = z.object({ refresh_token: z.string().min(1) });

export type LoginDto = z.infer<typeof loginSchema>;
export type RefreshDto = z.infer<typeof refreshSchema>;

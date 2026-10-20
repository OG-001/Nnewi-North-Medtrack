import { z } from "zod";
// One definition of a PIN, shared with the client and the bootstrap script.
import { staffPinSchema } from "@phc/shared";
import { ROLES } from "@phc/shared";

/**
 * A PIN is a fast re-auth credential on a shared clinic tablet, not the only
 * credential. Four to six digits matches what staff can enter quickly and
 * reliably; the real protection is that accounts are per-user, scoped, audited,
 * and revocable.
 */

export const createUserSchema = z.object({
  full_name: z.string().min(2).max(120),
  username: z.string().min(3).max(40).regex(/^[a-z0-9._-]+$/, "Lowercase letters, digits, . _ - only"),
  pin: staffPinSchema,
  phone: z.string().max(20).optional(),
  roles: z.array(z.enum(ROLES)).min(1),
  facility_ids: z.array(z.string().min(1)).min(1),
});

export const updateUserSchema = z.object({
  full_name: z.string().min(2).max(120).optional(),
  phone: z.string().max(20).optional(),
  roles: z.array(z.enum(ROLES)).min(1).optional(),
  facility_ids: z.array(z.string().min(1)).min(1).optional(),
  status: z.enum(["active", "disabled", "invited"]).optional(),
});

export const resetPinSchema = z.object({ pin: staffPinSchema });

export const createFacilitySchema = z.object({
  id: z.string().min(1).max(64),
  code: z.string().min(2).max(32),
  name: z.string().min(2).max(160),
  national_code: z.string().max(32).optional(),
  type: z.string().min(2).max(32),
  ward: z.string().max(80).optional(),
  town: z.string().max(80).optional(),
  lga: z.string().max(80).default("Nnewi North"),
  state: z.string().max(80).default("Anambra"),
  contact_phone: z.string().max(20).optional(),
});

export const updateFacilitySchema = createFacilitySchema.partial().omit({ id: true }).extend({
  active: z.boolean().optional(),
});

export type CreateUserDto = z.infer<typeof createUserSchema>;
export type UpdateUserDto = z.infer<typeof updateUserSchema>;
export type ResetPinDto = z.infer<typeof resetPinSchema>;
export type CreateFacilityDto = z.infer<typeof createFacilitySchema>;
export type UpdateFacilityDto = z.infer<typeof updateFacilitySchema>;

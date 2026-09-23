import { z } from "zod";

export const mergeSchema = z.object({
  surviving_id: z.string().min(1),
  merged_id: z.string().min(1),
  // A merge is irreversible in practice and moves clinical history. The reason
  // is what an auditor reads a year later, so a token string is not enough.
  reason: z.string().min(10).max(500),
});

export type MergeDto = z.infer<typeof mergeSchema>;

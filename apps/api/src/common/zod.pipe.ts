import { PipeTransform, Injectable } from "@nestjs/common";
import type { ZodSchema } from "zod";
import { ApiError } from "./api-error";

/** Validates a body against a Zod schema, reporting api-design §3 `details`. */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown) {
    const parsed = this.schema.safeParse(value);
    if (!parsed.success) {
      throw ApiError.validation(
        "Request body failed validation",
        parsed.error.issues.map((i) => ({
          field: i.path.join(".") || "(body)",
          issue: i.message,
        })),
      );
    }
    return parsed.data;
  }
}

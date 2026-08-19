import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Response } from "express";
import type { ApiErrorBody } from "@phc/shared";
import { ApiError } from "../api-error";

/** Renders every failure as the api-design §3 envelope, with a traceId. */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger("Api");

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const traceId = randomUUID();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = "INTERNAL";
    let message = "Unexpected error";
    let details: { field: string; issue: string }[] | undefined;

    if (exception instanceof ApiError) {
      status = exception.getStatus();
      code = exception.code;
      message = exception.message;
      details = exception.details;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      message = exception.message;
      code = status === 404 ? "NOT_FOUND" : status < 500 ? "VALIDATION_ERROR" : "INTERNAL";
    }

    if (status >= 500) {
      // Never log tokens or payload bodies alongside identifiers (§7 / NDPA).
      this.logger.error(`${code} traceId=${traceId}`, (exception as Error)?.stack);
    }

    const body: ApiErrorBody = { error: { code, message, details, traceId } };
    res.status(status).json(body);
  }
}

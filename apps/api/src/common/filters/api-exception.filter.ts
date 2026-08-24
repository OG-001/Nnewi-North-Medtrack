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

interface StatusCarryingError extends Error {
  status?: number;
  statusCode?: number;
  type?: string;
}

/** True for a non-Nest error that still knows its own HTTP status. */
function isStatusCarryingError(err: unknown): err is StatusCarryingError {
  if (!(err instanceof Error)) return false;
  const candidate = err as StatusCarryingError;
  return typeof candidate.status === "number" || typeof candidate.statusCode === "number";
}

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
    } else if (isStatusCarryingError(exception)) {
      // Errors from middleware below Nest, notably body-parser, are plain
      // Errors carrying a status. Without this they surface as 500, so a client
      // that simply sent too much data is told the server broke.
      status = exception.status ?? exception.statusCode ?? HttpStatus.BAD_REQUEST;
      if (status === HttpStatus.PAYLOAD_TOO_LARGE) {
        code = "PAYLOAD_TOO_LARGE";
        message = "Request body is larger than the server accepts";
      } else if (exception.type === "entity.parse.failed") {
        code = "VALIDATION_ERROR";
        message = "Request body is not valid JSON";
      } else {
        code = status < 500 ? "VALIDATION_ERROR" : "INTERNAL";
        message = status < 500 ? exception.message : "Unexpected error";
      }
    }

    if (status >= 500) {
      // Never log tokens or payload bodies alongside identifiers (§7 / NDPA).
      this.logger.error(`${code} traceId=${traceId}`, (exception as Error)?.stack);
    }

    const body: ApiErrorBody = { error: { code, message, details, traceId } };
    res.status(status).json(body);
  }
}

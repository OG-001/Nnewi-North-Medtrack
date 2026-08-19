import { HttpException, HttpStatus } from "@nestjs/common";

/**
 * Domain error carrying the api-design §3 `code`. The filter turns it into the
 * uniform envelope; throwing this keeps codes out of controllers' string soup.
 */
export class ApiError extends HttpException {
  constructor(
    status: HttpStatus,
    readonly code: string,
    message: string,
    readonly details?: { field: string; issue: string }[],
  ) {
    super(message, status);
  }

  static validation(message: string, details?: { field: string; issue: string }[]) {
    return new ApiError(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", message, details);
  }
  static unauthenticated(message = "Authentication required") {
    return new ApiError(HttpStatus.UNAUTHORIZED, "UNAUTHENTICATED", message);
  }
  static forbidden(message = "Forbidden") {
    return new ApiError(HttpStatus.FORBIDDEN, "FORBIDDEN", message);
  }
  static outOfScope(message = "Outside your facility scope") {
    return new ApiError(HttpStatus.FORBIDDEN, "OUT_OF_SCOPE", message);
  }
  static notFound(message = "Not found") {
    return new ApiError(HttpStatus.NOT_FOUND, "NOT_FOUND", message);
  }
}

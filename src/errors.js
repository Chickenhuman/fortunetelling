export class AppError extends Error {
  constructor({
    code,
    message,
    statusCode = 500,
    retryable = false,
    cause = null
  }) {
    super(message);
    this.name = "AppError";
    this.code = code || "INTERNAL_SERVER_ERROR";
    this.statusCode = statusCode;
    this.retryable = retryable;
    this.cause = cause;
  }
}

export function isAppError(error) {
  return error instanceof AppError;
}

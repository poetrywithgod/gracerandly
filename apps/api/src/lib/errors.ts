export class AppError extends Error {
  status: number;
  code: string;
  /** Which input(s) the problem is about, keyed like the validation errors
   * (see errorHandler), so an app can show the message under that input. */
  fields?: Record<string, string>;

  constructor(status: number, code: string, message: string, fields?: Record<string, string>) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

export const AppErrors = {
  validation: (message: string, fields?: Record<string, string>) => new AppError(400, "validation_error", message, fields),
  unauthorized: (message = "Invalid credentials", fields?: Record<string, string>) => new AppError(401, "unauthorized", message, fields),
  conflict: (message: string, fields?: Record<string, string>) => new AppError(409, "conflict", message, fields),
  notFound: (message = "Not found") => new AppError(404, "not_found", message),
  tooManyRequests: (message: string) => new AppError(429, "too_many_requests", message),
  deliveryFailed: (message: string) => new AppError(502, "delivery_failed", message),
};

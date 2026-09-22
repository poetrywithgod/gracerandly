export class AppError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
  }
}

export const AppErrors = {
  validation: (message: string) => new AppError(400, "validation_error", message),
  unauthorized: (message = "Invalid credentials") => new AppError(401, "unauthorized", message),
  conflict: (message: string) => new AppError(409, "conflict", message),
  notFound: (message = "Not found") => new AppError(404, "not_found", message),
  tooManyRequests: (message: string) => new AppError(429, "too_many_requests", message),
};

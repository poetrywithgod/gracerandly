import jwt from "jsonwebtoken";

const JWT_SECRET_ENV = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? "7d";

if (!JWT_SECRET_ENV) {
  throw new Error(
    "JWT_SECRET is not set. Copy apps/api/.env.example to apps/api/.env and fill it in."
  );
}

// Re-bound to a definitely-string const: TS's control-flow narrowing above
// doesn't carry into the functions below since they're separate closures
// over the outer JWT_SECRET_ENV, even though the throw guarantees it's set
// by the time either function is actually called.
const JWT_SECRET: string = JWT_SECRET_ENV;

export interface AuthTokenPayload {
  sub: string; // requester id
  role: "requester";
}

export function signAuthToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"] });
}

export function verifyAuthToken(token: string): AuthTokenPayload {
  // jwt.verify throws (TokenExpiredError / JsonWebTokenError) on anything
  // invalid — callers (see requireAuth middleware) are expected to catch it.
  return jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
}

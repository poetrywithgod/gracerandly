import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Gender, Requester } from "@gracerandly/shared-types";
import { apiFetch, ApiError } from "../lib/apiClient";

export interface AuthCredentials {
  phone: string;
  password: string;
}

export interface SignUpDetails {
  fullName: string;
  phone: string;
  email?: string;
  password: string;
  gender: Gender;
}

interface AuthResponse {
  token: string;
  user: Requester;
}

interface AuthContextValue {
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  user: Requester | null;
  token: string | null;
  signIn: (credentials: AuthCredentials) => Promise<void>;
  signUp: (details: SignUpDetails) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Token lives in memory only for now — it's lost on app reload/restart.
// TODO: persist it (expo-secure-store) so a session survives a restart,
// and add a bootstrap call to GET /auth/me on launch to restore it.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Requester | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAuthenticated = !!token;

  const signIn = useCallback(async ({ phone, password }: AuthCredentials) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiFetch<AuthResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ phone, password }),
      });
      setToken(response.token);
      setUser(response.user);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Something went wrong";
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const signUp = useCallback(async (details: SignUpDetails) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiFetch<AuthResponse>("/auth/signup", {
        method: "POST",
        body: JSON.stringify(details),
      });
      setToken(response.token);
      setUser(response.user);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Something went wrong";
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const signOut = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ isAuthenticated, isLoading, error, user, token, signIn, signUp, signOut }),
    [isAuthenticated, isLoading, error, user, token, signIn, signUp, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}

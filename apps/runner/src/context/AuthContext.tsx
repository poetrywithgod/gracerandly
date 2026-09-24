import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import * as SecureStore from "expo-secure-store";
import type { Runner } from "@gracerandly/shared-types";
import { apiFetch, ApiError } from "../lib/apiClient";

const TOKEN_STORAGE_KEY = "gracerandly_runner_auth_token";

export interface AuthCredentials {
  phone: string;
  password: string;
}

export interface SignUpDetails {
  fullName: string;
  phone: string;
  email?: string;
  password: string;
  nin: string;
  bvn: string;
  guarantor: { fullName: string; phone: string; relationship: string };
}

interface AuthResponse {
  token: string;
  user: Runner;
}

interface MeResponse {
  user: Runner;
}

interface AuthContextValue {
  isAuthenticated: boolean;
  isLoading: boolean;
  isRestoring: boolean;
  error: string | null;
  user: Runner | null;
  token: string | null;
  signIn: (credentials: AuthCredentials) => Promise<void>;
  signUp: (details: SignUpDetails) => Promise<void>;
  signOut: () => Promise<void>;
  /** Updates isOnline (and, when going online, the runner's current
   * position) both on the server and in local state. Screens that need to
   * report a fresh location while already online (e.g. the background
   * watcher in lib/location.ts) should call this too, passing the same
   * isOnline value back through. */
  setOnlineStatus: (isOnline: boolean, location?: { lat: number; lng: number; heading?: number }) => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function readableError(err: unknown): string {
  return err instanceof ApiError ? err.message : "Something went wrong";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Runner | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAuthenticated = !!token;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const savedToken = await SecureStore.getItemAsync(TOKEN_STORAGE_KEY);
      if (!savedToken) {
        if (!cancelled) setIsRestoring(false);
        return;
      }
      try {
        const response = await apiFetch<MeResponse>("/runners/me", {
          headers: { Authorization: `Bearer ${savedToken}` },
        });
        if (!cancelled) {
          setToken(savedToken);
          setUser(response.user);
        }
      } catch {
        await SecureStore.deleteItemAsync(TOKEN_STORAGE_KEY);
      } finally {
        if (!cancelled) setIsRestoring(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async ({ phone, password }: AuthCredentials) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiFetch<AuthResponse>("/runners/auth/login", {
        method: "POST",
        body: JSON.stringify({ phone, password }),
      });
      await SecureStore.setItemAsync(TOKEN_STORAGE_KEY, response.token);
      setToken(response.token);
      setUser(response.user);
    } catch (err) {
      setError(readableError(err));
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const signUp = useCallback(async (details: SignUpDetails) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiFetch<AuthResponse>("/runners/auth/signup", {
        method: "POST",
        body: JSON.stringify(details),
      });
      await SecureStore.setItemAsync(TOKEN_STORAGE_KEY, response.token);
      setToken(response.token);
      setUser(response.user);
    } catch (err) {
      setError(readableError(err));
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    await SecureStore.deleteItemAsync(TOKEN_STORAGE_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    if (!token) return;
    const response = await apiFetch<MeResponse>("/runners/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    setUser(response.user);
  }, [token]);

  const setOnlineStatus = useCallback(
    async (isOnline: boolean, location?: { lat: number; lng: number; heading?: number }) => {
      if (!token) return;
      try {
        const response = await apiFetch<MeResponse>("/runners/me/status", {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}` },
          body: JSON.stringify({ isOnline, location }),
        });
        setUser(response.user);
      } catch (err) {
        setError(readableError(err));
        throw err;
      }
    },
    [token]
  );

  const value = useMemo(
    () => ({
      isAuthenticated,
      isLoading,
      isRestoring,
      error,
      user,
      token,
      signIn,
      signUp,
      signOut,
      setOnlineStatus,
      refreshUser,
    }),
    [isAuthenticated, isLoading, isRestoring, error, user, token, signIn, signUp, signOut, setOnlineStatus, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import * as SecureStore from "expo-secure-store";
import type { Gender, Requester, RequesterStatus, VerificationChannel } from "@gracerandly/shared-types";
import { apiFetch, ApiError } from "../lib/apiClient";

const TOKEN_STORAGE_KEY = "gracerandly_auth_token";

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

export interface UpdateProfileDetails {
  fullName?: string;
  email?: string;
  gender?: Gender;
  bio?: string;
  status?: RequesterStatus;
}

interface AuthResponse {
  token: string;
  user: Requester;
}

interface MeResponse {
  user: Requester;
}

export interface RequestVerificationResult {
  sent: true;
  destination: string;
  /** Only present when the API's EXPOSE_DEV_VERIFICATION_CODES flag is on. */
  devCode?: string;
}

interface AuthContextValue {
  isAuthenticated: boolean;
  isLoading: boolean;
  isRestoring: boolean;
  error: string | null;
  user: Requester | null;
  token: string | null;
  signIn: (credentials: AuthCredentials) => Promise<void>;
  signUp: (details: SignUpDetails) => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (details: UpdateProfileDetails) => Promise<void>;
  updateAvatar: (imageDataUri: string | null) => Promise<void>;
  requestVerification: (channel: VerificationChannel) => Promise<RequestVerificationResult>;
  confirmVerification: (channel: VerificationChannel, code: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function readableError(err: unknown): string {
  return err instanceof ApiError ? err.message : "Something went wrong";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Requester | null>(null);
  const [token, setToken] = useState<string | null>(null);
  // isRestoring covers the one-time "do we have a saved session?" check on
  // app launch — RootNavigator shows a loading state for it instead of
  // briefly flashing the login screen.
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
        const response = await apiFetch<MeResponse>("/auth/me", {
          headers: { Authorization: `Bearer ${savedToken}` },
        });
        if (!cancelled) {
          setToken(savedToken);
          setUser(response.user);
        }
      } catch {
        // Saved token is invalid/expired — clear it and fall through to login.
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
      const response = await apiFetch<AuthResponse>("/auth/login", {
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
      const response = await apiFetch<AuthResponse>("/auth/signup", {
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

  const updateProfile = useCallback(
    async (details: UpdateProfileDetails) => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await apiFetch<MeResponse>("/auth/me", {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}` },
          body: JSON.stringify(details),
        });
        setUser(response.user);
      } catch (err) {
        setError(readableError(err));
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [token]
  );

  const signOut = useCallback(async () => {
    await SecureStore.deleteItemAsync(TOKEN_STORAGE_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const updateAvatar = useCallback(
    async (imageDataUri: string | null) => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await apiFetch<MeResponse>("/auth/me/avatar", {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}` },
          body: JSON.stringify({ image: imageDataUri }),
        });
        setUser(response.user);
      } catch (err) {
        setError(readableError(err));
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [token]
  );

  const requestVerification = useCallback(
    async (channel: VerificationChannel) => {
      // Deliberately doesn't touch isLoading/error — this drives a small
      // inline modal that manages its own loading/error state, and
      // shouldn't flip the whole screen into AuthContext's loading state.
      return apiFetch<RequestVerificationResult>("/auth/verify/request", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ channel }),
      });
    },
    [token]
  );

  const confirmVerification = useCallback(
    async (channel: VerificationChannel, code: string) => {
      const response = await apiFetch<MeResponse>("/auth/verify/confirm", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ channel, code }),
      });
      setUser(response.user);
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
      updateProfile,
      updateAvatar,
      requestVerification,
      confirmVerification,
    }),
    [
      isAuthenticated,
      isLoading,
      isRestoring,
      error,
      user,
      token,
      signIn,
      signUp,
      signOut,
      updateProfile,
      updateAvatar,
      requestVerification,
      confirmVerification,
    ]
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

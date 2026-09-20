import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

export interface AuthCredentials {
  phone: string;
  password: string;
}

interface AuthContextValue {
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  signIn: (credentials: AuthCredentials) => Promise<void>;
  signUp: (credentials: AuthCredentials) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// TODO: replace with real calls to apps/api once auth endpoints exist.
// This mock just simulates network latency and always succeeds so the
// Login/Signup screens are clickable end-to-end (they flip RootNavigator
// over to MainNavigator) while the real API is being built.
const MOCK_LATENCY_MS = 600;

function mockRequest(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, MOCK_LATENCY_MS));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = useCallback(async ({ phone, password }: AuthCredentials) => {
    setIsLoading(true);
    setError(null);
    try {
      await mockRequest();
      if (!phone || !password) {
        throw new Error("Phone number and password are required");
      }
      setIsAuthenticated(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const signUp = useCallback(async ({ phone, password }: AuthCredentials) => {
    setIsLoading(true);
    setError(null);
    try {
      await mockRequest();
      if (!phone || !password) {
        throw new Error("Phone number and password are required");
      }
      setIsAuthenticated(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const signOut = useCallback(() => {
    setIsAuthenticated(false);
  }, []);

  const value = useMemo(
    () => ({ isAuthenticated, isLoading, error, signIn, signUp, signOut }),
    [isAuthenticated, isLoading, error, signIn, signUp, signOut]
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

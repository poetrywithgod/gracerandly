import Constants from "expo-constants";
import { Platform } from "react-native";

const API_PORT = 4000;

function resolveApiBaseUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl) return envUrl.replace(/\/+$/, "");

  // Running via `expo start` (Expo Go or a dev client) on a physical
  // device: Metro's own host is reachable over the same LAN, so reuse its
  // IP to find the API with zero manual config. Looks like "192.168.1.5:8081".
  const hostUri = Constants.expoConfig?.hostUri;
  const lanHost = hostUri?.split(":")[0];
  if (lanHost) {
    return `http://${lanHost}:${API_PORT}`;
  }

  // No hostUri (e.g. a standalone/EAS build): fall back to the platform's
  // usual "talk to my host machine" address.
  if (Platform.OS === "android") {
    return `http://10.0.2.2:${API_PORT}`; // Android emulator's alias for the host machine
  }
  return `http://localhost:${API_PORT}`; // iOS simulator / web
}

export const API_BASE_URL = resolveApiBaseUrl();

interface ApiErrorBody {
  error?: { code?: string; message?: string };
}

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your connection and try again.");
  }

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await response.json().catch(() => undefined) : undefined;

  if (!response.ok) {
    const errorBody = body as ApiErrorBody | undefined;
    throw new ApiError(
      response.status,
      errorBody?.error?.message ?? `Request failed with status ${response.status}`,
      errorBody?.error?.code
    );
  }

  return body as T;
}

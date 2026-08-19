/**
 * Typed client for the NestJS sync hub (api-design §1). Holds the token pair,
 * refreshes transparently on a 401, and unwraps the §3 error envelope.
 *
 * Everything here is optional to the app: when the hub is unreachable the PWA
 * keeps working entirely on the local store — the network is never on the
 * critical path for care (offline-sync-design §1).
 */
import { APP_CONFIG, type ApiErrorBody } from "@phc/shared";

const TOKEN_KEY = "phc-track.tokens";

export const API_BASE_URL: string =
  (import.meta.env?.VITE_API_BASE_URL as string | undefined) || APP_CONFIG.apiBaseUrl;

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function readTokens(): TokenPair | null {
  const raw = localStorage.getItem(TOKEN_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TokenPair;
  } catch {
    return null;
  }
}

export function storeTokens(tokens: TokenPair | null) {
  if (tokens) localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
  else localStorage.removeItem(TOKEN_KEY);
}

export function hasHubSession(): boolean {
  return readTokens() !== null;
}

async function parseError(res: Response): Promise<ApiError> {
  let code = "INTERNAL";
  let message = res.statusText || "Request failed";
  try {
    const body = (await res.json()) as ApiErrorBody;
    if (body?.error) {
      code = body.error.code;
      message = body.error.message;
    }
  } catch {
    /* non-JSON error body — keep the status text */
  }
  return new ApiError(code, message, res.status);
}

async function rawRequest(path: string, init: RequestInit, token?: string): Promise<Response> {
  return fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
}

/** Authenticated request with one transparent refresh-and-retry on 401. */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const tokens = readTokens();
  if (!tokens) throw new ApiError("UNAUTHENTICATED", "Not signed in to the hub", 401);

  let res = await rawRequest(path, init, tokens.accessToken);

  if (res.status === 401) {
    const refreshed = await refreshTokens(tokens.refreshToken);
    if (!refreshed) throw new ApiError("UNAUTHENTICATED", "Hub session expired", 401);
    res = await rawRequest(path, init, refreshed.accessToken);
  }

  if (!res.ok) throw await parseError(res);
  return (await res.json()) as T;
}

async function refreshTokens(refreshToken: string): Promise<TokenPair | null> {
  const res = await rawRequest("/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!res.ok) {
    storeTokens(null);
    return null;
  }
  const body = (await res.json()) as TokenPair;
  storeTokens({ accessToken: body.accessToken, refreshToken: body.refreshToken });
  return body;
}

/** Sign in to the hub. Facility-scoped, exactly like the offline PIN check. */
export async function hubLogin(
  username: string,
  pin: string,
  facilityId: string,
  deviceId: string,
) {
  const res = await rawRequest("/auth/login", {
    method: "POST",
    body: JSON.stringify({
      username,
      pin,
      facility_id: facilityId,
      device_id: deviceId,
    }),
  });
  if (!res.ok) throw await parseError(res);
  const body = (await res.json()) as TokenPair & {
    user: { id: string; username: string; fullName: string };
    roles: string[];
    scope: string[] | null;
  };
  storeTokens({ accessToken: body.accessToken, refreshToken: body.refreshToken });
  return body;
}

export async function hubLogout() {
  const tokens = readTokens();
  if (tokens) {
    await rawRequest("/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refresh_token: tokens.refreshToken }),
    }).catch(() => undefined);
  }
  storeTokens(null);
}

/** Cheap reachability probe used before a sync cycle. */
export async function hubReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE_URL}/system/health`, { method: "GET" });
    return res.ok;
  } catch {
    return false;
  }
}

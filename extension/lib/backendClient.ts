/** Background-only PromptPrint API client. No secrets; session token from storage. */

export const DEFAULT_BACKEND_BASE = "http://127.0.0.1:8000";

export type BackendConfig = {
  baseUrl: string;
  sessionToken: string | null;
  backendEnabled: boolean;
};

export type HealthResult =
  | { ok: true; status: string; mode?: string; reason?: string; daytona?: boolean }
  | { ok: false; error: string; status?: number };

export function resolveBaseUrl(stored?: string | null): string {
  const raw = (stored ?? "").trim().replace(/\/+$/, "");
  if (!raw) return DEFAULT_BACKEND_BASE;
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return DEFAULT_BACKEND_BASE;
    return `${u.protocol}//${u.host}`;
  } catch {
    return DEFAULT_BACKEND_BASE;
  }
}

export async function readBackendConfig(): Promise<BackendConfig> {
  const raw = await browser.storage.local.get([
    "backendBaseUrl",
    "coachingSessionToken",
    "backendEnabled",
  ]);
  return {
    baseUrl: resolveBaseUrl(
      typeof raw.backendBaseUrl === "string" ? raw.backendBaseUrl : null,
    ),
    sessionToken:
      typeof raw.coachingSessionToken === "string" && raw.coachingSessionToken
        ? raw.coachingSessionToken
        : null,
    backendEnabled: raw.backendEnabled !== false,
  };
}

export async function writeBackendConfig(
  patch: Partial<{
    backendBaseUrl: string;
    coachingSessionToken: string | null;
    backendEnabled: boolean;
  }>,
): Promise<void> {
  const next: Record<string, unknown> = {};
  if (patch.backendBaseUrl !== undefined) next.backendBaseUrl = patch.backendBaseUrl;
  if (patch.coachingSessionToken !== undefined) {
    next.coachingSessionToken = patch.coachingSessionToken;
  }
  if (patch.backendEnabled !== undefined) next.backendEnabled = patch.backendEnabled;
  await browser.storage.local.set(next);
}

type FetchLike = typeof fetch;

export async function fetchHealth(
  baseUrl: string,
  fetchImpl: FetchLike = fetch,
): Promise<HealthResult> {
  const url = `${resolveBaseUrl(baseUrl)}/health`;
  try {
    const res = await fetchImpl(url, { method: "GET" });
    if (!res.ok) {
      return { ok: false, error: `http_${res.status}`, status: res.status };
    }
    const body = (await res.json()) as {
      status?: string;
      mode?: string;
      reason?: string;
      daytona?: boolean;
    };
    if (body.status !== "ok") {
      return { ok: false, error: "bad_status" };
    }
    return {
      ok: true,
      status: "ok",
      mode: body.mode,
      reason: body.reason,
      daytona: body.daytona,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "network_error",
    };
  }
}

export async function backendHealth(): Promise<HealthResult> {
  const cfg = await readBackendConfig();
  if (!cfg.backendEnabled) {
    return { ok: false, error: "backend_disabled" };
  }
  return fetchHealth(cfg.baseUrl);
}

export async function backendFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const cfg = await readBackendConfig();
  if (!cfg.backendEnabled) {
    throw new Error("backend_disabled");
  }
  const headers = new Headers(init.headers);
  if (cfg.sessionToken && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${cfg.sessionToken}`);
  }
  return fetch(`${cfg.baseUrl}${path.startsWith("/") ? path : `/${path}`}`, {
    ...init,
    headers,
  });
}

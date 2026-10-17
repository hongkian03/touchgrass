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

export type JobStatus = {
  id?: string;
  type?: string;
  status: string;
  error?: string | null;
  summary?: Record<string, unknown> | null;
};

export type BackendTip = {
  id: string;
  title?: string;
  pattern?: string;
  how_to_fix?: string;
  evidence?: { examples?: string[]; counts?: Record<string, unknown> };
  estimated_savings?: unknown;
};

export type InsightsPayload = {
  job_id?: string;
  insights: {
    tips?: BackendTip[];
    totals?: unknown;
    generated_at?: string;
    period?: unknown;
  };
};

export function mapTipsToCards(
  tips: BackendTip[],
): Array<{ id: string; text: string }> {
  return tips.slice(0, 3).map((t) => ({
    id: t.id,
    text: (t.title || t.how_to_fix || t.pattern || t.id).trim(),
  }));
}

export async function uploadExport(
  bytes: ArrayBuffer,
  filename: string,
): Promise<{ job_id: string }> {
  const cfg = await readBackendConfig();
  if (!cfg.backendEnabled) throw new Error("backend_disabled");
  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(bytes)], { type: "application/json" }),
    filename || "export.json",
  );
  const res = await fetch(`${cfg.baseUrl}/upload`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    throw new Error(`upload_http_${res.status}`);
  }
  const body = (await res.json()) as { job_id?: string };
  if (!body.job_id) throw new Error("upload_missing_job_id");
  return { job_id: body.job_id };
}

export async function getJob(jobId: string): Promise<JobStatus> {
  const res = await backendFetch(`/jobs/${encodeURIComponent(jobId)}`);
  if (!res.ok) throw new Error(`job_http_${res.status}`);
  return (await res.json()) as JobStatus;
}

export async function waitForJob(
  jobId: string,
  opts: { timeoutMs?: number; pollMs?: number } = {},
): Promise<JobStatus> {
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const pollMs = opts.pollMs ?? 500;
  const start = Date.now();
  for (;;) {
    const job = await getJob(jobId);
    if (job.status === "succeeded" || job.status === "failed") return job;
    if (Date.now() - start > timeoutMs) {
      throw new Error(`job_timeout:${job.status}`);
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
}

export async function getInsightsLatest(): Promise<InsightsPayload> {
  const res = await backendFetch("/insights/latest");
  if (!res.ok) throw new Error(`insights_http_${res.status}`);
  const body = (await res.json()) as InsightsPayload & {
    tips?: BackendTip[];
  };
  // Support both {insights:{tips}} and flat {tips}
  if (!body.insights && Array.isArray(body.tips)) {
    return { job_id: body.job_id, insights: { tips: body.tips } };
  }
  return body;
}

/** Upload → wait → latest insights. Used by dashboard + tests. */
export async function runUploadPipeline(
  bytes: ArrayBuffer,
  filename: string,
): Promise<{
  job_id: string;
  job: JobStatus;
  cards: Array<{ id: string; text: string }>;
}> {
  const { job_id } = await uploadExport(bytes, filename);
  const job = await waitForJob(job_id);
  if (job.status !== "succeeded") {
    throw new Error(job.error || `job_${job.status}`);
  }
  const latest = await getInsightsLatest();
  const tips = latest.insights?.tips ?? [];
  return { job_id, job, cards: mapTipsToCards(tips) };
}

export type SiteAdapterPayload = {
  site: string;
  version: number;
  selectors: Record<string, string>;
};

export async function fetchAdapterVersions(): Promise<Record<string, number>> {
  const res = await backendFetch("/adapters/versions");
  if (!res.ok) throw new Error(`adapters_versions_http_${res.status}`);
  return (await res.json()) as Record<string, number>;
}

export async function fetchAdapter(site: string): Promise<SiteAdapterPayload> {
  const res = await backendFetch(`/adapters/${encodeURIComponent(site)}`);
  if (!res.ok) throw new Error(`adapter_http_${res.status}`);
  return (await res.json()) as SiteAdapterPayload;
}

export type AdapterFailureReport = {
  site: string;
  failed_keys: string[];
  adapter_version: number;
  snapshot_html: string;
  adapter?: SiteAdapterPayload | null;
  expected_prompt?: string | null;
  has_responses?: boolean;
};

export async function reportAdapterFailure(
  report: AdapterFailureReport,
): Promise<{
  job_id?: string;
  ignored?: boolean;
  duplicate?: boolean;
  reason?: string;
  current_version?: number;
}> {
  const res = await backendFetch("/adapter-failure", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      site: report.site,
      failed_keys: report.failed_keys,
      adapter_version: report.adapter_version,
      snapshot_html: report.snapshot_html,
      adapter: report.adapter ?? undefined,
      expected_prompt: report.expected_prompt ?? undefined,
      has_responses: report.has_responses ?? true,
    }),
  });
  if (!res.ok) throw new Error(`adapter_failure_http_${res.status}`);
  return (await res.json()) as {
    job_id?: string;
    ignored?: boolean;
    duplicate?: boolean;
    reason?: string;
    current_version?: number;
  };
}

/** Report failure → wait for repair → fetch published adapter. */
export async function runAdapterRepairPipeline(
  report: AdapterFailureReport,
): Promise<{
  job_id: string | null;
  ignored: boolean;
  adapter: SiteAdapterPayload | null;
}> {
  const result = await reportAdapterFailure(report);
  if (result.ignored) {
    const adapter = await fetchAdapter(report.site).catch(() => null);
    return { job_id: null, ignored: true, adapter };
  }
  const job_id = result.job_id;
  if (!job_id) throw new Error("adapter_failure_missing_job_id");
  const job = await waitForJob(job_id, { timeoutMs: 180_000 });
  if (job.status !== "succeeded") {
    throw new Error(job.error || `repair_${job.status}`);
  }
  const adapter = await fetchAdapter(report.site);
  return { job_id, ignored: false, adapter };
}

/** Sync cached adapters from GET /adapters/versions + /adapters/{site}. */
export async function syncAdaptersFromBackend(): Promise<
  Record<string, SiteAdapterPayload>
> {
  const versions = await fetchAdapterVersions();
  const { readCachedAdapters, writeCachedAdapter } = await import("./adapter");
  const cached = await readCachedAdapters();
  const updated: Record<string, SiteAdapterPayload> = { ...cached };
  for (const [site, version] of Object.entries(versions)) {
    const cur = cached[site];
    if (cur && cur.version >= version) {
      updated[site] = cur;
      continue;
    }
    const fresh = await fetchAdapter(site);
    await writeCachedAdapter(fresh);
    updated[site] = fresh;
  }
  return updated;
}

export async function pairCoachingSession(
  code: string,
): Promise<{ session_token: string }> {
  const cfg = await readBackendConfig();
  const res = await fetch(`${cfg.baseUrl}/coaching/pair`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) throw new Error(`pair_http_${res.status}`);
  const body = (await res.json()) as { session_token?: string };
  if (!body.session_token) throw new Error("pair_missing_token");
  await writeBackendConfig({ coachingSessionToken: body.session_token });
  return { session_token: body.session_token };
}

export async function coachingClassify(
  draft: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const res = await backendFetch("/classify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draft),
    signal,
  });
  if (!res.ok) throw new Error(`classify_http_${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

export async function coachingEmitEvent(
  event: Record<string, unknown>,
): Promise<{ status?: string }> {
  const res = await backendFetch("/coaching/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
  });
  if (!res.ok) throw new Error(`events_http_${res.status}`);
  return (await res.json()) as { status?: string };
}

export type EvalsSummary =
  | { status: "not_run" }
  | {
      status?: string;
      source_mode?: string;
      [key: string]: unknown;
    };

export async function fetchEvalsSummary(): Promise<EvalsSummary> {
  const res = await backendFetch("/evals/summary");
  if (!res.ok) throw new Error(`evals_http_${res.status}`);
  return (await res.json()) as EvalsSummary;
}

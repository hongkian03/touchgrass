import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_BACKEND_BASE,
  fetchHealth,
  resolveBaseUrl,
} from "../lib/backendClient";

describe("resolveBaseUrl", () => {
  it("defaults when empty", () => {
    expect(resolveBaseUrl(null)).toBe(DEFAULT_BACKEND_BASE);
    expect(resolveBaseUrl("")).toBe(DEFAULT_BACKEND_BASE);
    expect(resolveBaseUrl("   ")).toBe(DEFAULT_BACKEND_BASE);
  });

  it("strips trailing slash", () => {
    expect(resolveBaseUrl("http://127.0.0.1:8000/")).toBe(
      "http://127.0.0.1:8000",
    );
  });

  it("rejects non-http schemes", () => {
    expect(resolveBaseUrl("file:///tmp")).toBe(DEFAULT_BACKEND_BASE);
  });
});

describe("fetchHealth", () => {
  it("returns ok when /health status is ok", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ status: "ok", mode: "replay" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ) as unknown as typeof fetch;
    const result = await fetchHealth("http://127.0.0.1:8000", fetchImpl);
    expect(result).toEqual({
      ok: true,
      status: "ok",
      mode: "replay",
      reason: undefined,
      daytona: undefined,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/health",
      { method: "GET" },
    );
  });

  it("returns not ok on network failure", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("Failed to fetch");
    }) as unknown as typeof fetch;
    const result = await fetchHealth("http://127.0.0.1:8000", fetchImpl);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Failed to fetch/);
  });
});

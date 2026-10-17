import { afterEach, describe, expect, it, vi } from "vitest";
import { groqRouteQuery, parseRouteQueryResponse } from "../lib/groqRoute";

describe("parseRouteQueryResponse", () => {
  it("accepts enabled platformId", () => {
    const r = parseRouteQueryResponse(
      '{"platformId":"perplexity","reason":"weather lookup"}',
      ["claude", "perplexity", "gemini"],
      "claude",
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.platformId).toBe("perplexity");
      expect(r.reason).toMatch(/weather/i);
    }
  });

  it("refuses DeepSeek", () => {
    const r = parseRouteQueryResponse(
      '{"platformId":"deepseek","reason":"cheap"}',
      ["chatgpt", "deepseek", "gemini"],
      "chatgpt",
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("refuse_deepseek");
  });

  it("falls back to current when id not in enabled list", () => {
    const r = parseRouteQueryResponse(
      '{"platformId":"midjourney","reason":"oops"}',
      ["claude", "gemini"],
      "claude",
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.platformId).toBe("claude");
  });

  it("fails on empty enabled", () => {
    const r = parseRouteQueryResponse(
      '{"platformId":"gemini","reason":"x"}',
      [],
      "claude",
    );
    expect(r.ok).toBe(false);
  });

  it("strips markdown fences around JSON", () => {
    const r = parseRouteQueryResponse(
      'Here you go:\n```json\n{"platformId":"gemini","reason":"simple ask"}\n```',
      ["gemini", "claude"],
      "claude",
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.platformId).toBe("gemini");
  });
});

describe("groqRouteQuery", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns missing_key without env", async () => {
    vi.stubEnv("WXT_GROQ_API_KEY", "");
    const r = await groqRouteQuery({
      draft: "what's the weather",
      currentProvider: "claude",
      enabledPlatforms: ["claude", "perplexity"],
    });
    // empty string still counts as missing for our check
    expect(r.ok).toBe(false);
  });

  it("parses successful Groq response", async () => {
    vi.stubEnv("WXT_GROQ_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content:
                  '{"platformId":"perplexity","reason":"live weather"}',
              },
            },
          ],
        }),
      })),
    );

    const r = await groqRouteQuery({
      draft: "whats todays weather in cambridge",
      currentProvider: "claude",
      enabledPlatforms: ["claude", "perplexity", "gemini"],
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.platformId).toBe("perplexity");
  });

  it("never invents on HTTP failure", async () => {
    vi.stubEnv("WXT_GROQ_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 500,
        text: async () => "boom",
      })),
    );

    const r = await groqRouteQuery({
      draft: "weather please",
      currentProvider: "claude",
      enabledPlatforms: ["claude", "gemini"],
    });
    expect(r.ok).toBe(false);
  });
});

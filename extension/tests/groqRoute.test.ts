import { afterEach, describe, expect, it, vi } from "vitest";
import {
  groqRouteQuery,
  parseRouteQueryResponse,
  simpleHopFallbackId,
  weatherFallbackId,
} from "../lib/groqRoute";

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

  it("prefers non-DeepSeek when alternatives exist", () => {
    const r = parseRouteQueryResponse(
      '{"platformId":"deepseek","reason":"cheap"}',
      ["chatgpt", "deepseek", "gemini"],
      "chatgpt",
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.platformId).not.toMatch(/deepseek/i);
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

  it("weather draft forces hop off claude when gemini enabled", () => {
    const r = parseRouteQueryResponse(
      '{"platformId":"claude","reason":"already best"}',
      ["claude", "gemini"],
      "claude",
      "whats todays weather?",
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.platformId).toBe("gemini");
  });

  it("define ask forces hop off claude when gemini enabled", () => {
    const r = parseRouteQueryResponse(
      '{"platformId":"claude","reason":"already best"}',
      ["claude", "gemini"],
      "claude",
      "define photosynthesis",
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.platformId).toBe("gemini");
  });

  it("translate ask forces hop to perplexity when enabled", () => {
    const r = parseRouteQueryResponse(
      '{"platformId":"claude","reason":"stay"}',
      ["claude", "perplexity", "gemini"],
      "claude",
      "translate hello to spanish",
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.platformId).toBe("perplexity");
  });

  it("who-is ask forces hop off chatgpt", () => {
    const r = parseRouteQueryResponse(
      '{"platformId":"chatgpt","reason":"stay"}',
      ["chatgpt", "gemini"],
      "chatgpt",
      "who is ada lovelace",
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.platformId).toBe("gemini");
  });

  it("hard coding ask does not force hop when Groq says stay", () => {
    const r = parseRouteQueryResponse(
      '{"platformId":"claude","reason":"needs reasoning"}',
      ["claude", "gemini"],
      "claude",
      "refactor this typescript module with generics and tests",
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.platformId).toBe("claude");
  });

  it("hop logic is not hardcoded to one weather string", () => {
    const src = parseRouteQueryResponse.toString();
    expect(src).not.toContain("whats todays weather?");
    expect(src).not.toContain("what's the weather today");
  });

  it("simpleHopFallbackId prefers perplexity then gemini", () => {
    expect(simpleHopFallbackId(["claude", "gemini"], "claude")).toBe("gemini");
    expect(
      simpleHopFallbackId(["claude", "perplexity", "gemini"], "claude"),
    ).toBe("perplexity");
    expect(weatherFallbackId(["claude", "gemini"], "claude")).toBe("gemini");
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

  it("simple-ask HTTP failure falls back to gemini when enabled", async () => {
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
      draft: "define entropy",
      currentProvider: "claude",
      enabledPlatforms: ["claude", "gemini"],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.platformId).toBe("gemini");
      expect(r.reason).toMatch(/fallback/i);
    }
  });

  it("hard-ask HTTP failure does not invent a hop", async () => {
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
      draft: "refactor this typescript module with generics and tests",
      currentProvider: "claude",
      enabledPlatforms: ["claude", "gemini"],
    });
    expect(r.ok).toBe(false);
  });
});

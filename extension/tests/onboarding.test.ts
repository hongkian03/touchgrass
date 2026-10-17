import { describe, expect, it } from "vitest";
import { buildPlatformGridItems } from "../components/PlatformGrid";
import { isAllowedAiHost } from "../lib/aiSites";
import {
  canContinueOnboarding,
  customPlatformId,
  hostsForPlatforms,
  originPatternFromInput,
  resolvePlatformFromInput,
} from "../lib/hosts";
import type { Platform } from "../lib/types";

const platforms: Platform[] = [
  {
    id: "chatgpt",
    name: "ChatGPT",
    hosts: ["https://chatgpt.com/*", "https://chat.openai.com/*"],
    icon: "openai-chatgpt",
    defaultModel: "gpt-5",
    smallModel: "gpt-4o-mini",
    kind: "text",
  },
  {
    id: "claude",
    name: "Claude",
    hosts: ["https://claude.ai/*"],
    icon: "claude-ai",
    defaultModel: "claude-opus",
    smallModel: "claude-haiku",
    kind: "text",
  },
  {
    id: "gemini",
    name: "Gemini",
    hosts: ["https://gemini.google.com/*"],
    icon: "gemini",
    defaultModel: "gemini-pro",
    smallModel: "gemini-flash",
    kind: "text",
  },
  {
    id: "midjourney",
    name: "Midjourney",
    hosts: ["https://www.midjourney.com/*"],
    icon: "midjourney",
    defaultModel: "midjourney-v6",
    smallModel: "midjourney-v6",
    kind: "image",
  },
];

describe("onboarding continue gate", () => {
  it("disabled when selected-count is 0", () => {
    expect(canContinueOnboarding(0)).toBe(false);
  });

  it("enabled when selected-count is 1", () => {
    expect(canContinueOnboarding(1)).toBe(true);
  });

  it("enabled when selected-count is many", () => {
    expect(canContinueOnboarding(3)).toBe(true);
  });
});

describe("permission hosts match selection", () => {
  it("returns only hosts for picked platforms", () => {
    const hosts = hostsForPlatforms(["claude"], platforms);
    expect(hosts).toEqual(["https://claude.ai/*"]);
    expect(hosts).not.toContain("https://chatgpt.com/*");
  });

  it("unions hosts when multiple platforms selected", () => {
    const hosts = hostsForPlatforms(["chatgpt", "claude"], platforms);
    expect(hosts).toContain("https://chatgpt.com/*");
    expect(hosts).toContain("https://chat.openai.com/*");
    expect(hosts).toContain("https://claude.ai/*");
    expect(hosts).toHaveLength(3);
  });

  it("includes custom site hosts", () => {
    const id = customPlatformId("poe.com");
    const hosts = hostsForPlatforms(["claude", id], platforms);
    expect(hosts).toContain("https://claude.ai/*");
    expect(hosts).toContain("https://poe.com/*");
  });
});

describe("url / site entry", () => {
  it("normalizes bare domain to https pattern", () => {
    expect(originPatternFromInput("claude.ai")).toBe("https://claude.ai/*");
    expect(originPatternFromInput("https://chatgpt.com/c/abc")).toBe(
      "https://chatgpt.com/*",
    );
  });

  it("rejects junk input", () => {
    expect(originPatternFromInput("")).toBeNull();
    expect(originPatternFromInput("not a url")).toBeNull();
  });

  it("maps known host to platform id", () => {
    const hit = resolvePlatformFromInput("https://claude.ai/new", platforms);
    expect(hit.ok && hit.id).toBe("claude");
  });

  it("maps aliases and deep paths to the right logo platform", () => {
    expect(resolvePlatformFromInput("https://chat.openai.com/", platforms)).toMatchObject(
      { ok: true, id: "chatgpt" },
    );
    expect(resolvePlatformFromInput("openai.com", platforms)).toMatchObject({
      ok: true,
      id: "chatgpt",
    });
    expect(
      resolvePlatformFromInput("https://gemini.google.com/app", platforms),
    ).toMatchObject({ ok: true, id: "gemini" });
  });

  it("allows curated AI sites as custom tiles", () => {
    const hit = resolvePlatformFromInput("poe.com", platforms);
    expect(hit).toMatchObject({ ok: true, id: "custom:poe.com" });
    expect(resolvePlatformFromInput("https://mistral.ai/", platforms)).toMatchObject({
      ok: true,
      id: "custom:mistral.ai",
    });
    expect(resolvePlatformFromInput("copilot.com", platforms)).toMatchObject({
      ok: true,
      id: "custom:copilot.com",
    });
  });

  it("rejects non-AI sites like YouTube and news", () => {
    expect(resolvePlatformFromInput("youtube.com", platforms)).toMatchObject({
      ok: false,
      reason: "not_ai",
    });
    expect(resolvePlatformFromInput("https://www.nytimes.com/", platforms)).toMatchObject({
      ok: false,
      reason: "not_ai",
    });
    expect(resolvePlatformFromInput("amazon.com", platforms)).toMatchObject({
      ok: false,
      reason: "not_ai",
    });
    expect(isAllowedAiHost("youtube.com")).toBe(false);
    expect(isAllowedAiHost("mistral.ai")).toBe(true);
  });

  it("random URLs resolve to the expected brand or custom AI host", async () => {
    const full = (
      await import("../data/platforms.json")
    ).default as Platform[];
    const samples: Array<[string, string]> = [
      ["https://chatgpt.com/c/abc123?model=gpt-5", "chatgpt"],
      ["HTTPS://WWW.Claude.AI/chat", "claude"],
      ["gemini.google.com/app/foo", "gemini"],
      ["https://www.perplexity.ai/search/new", "perplexity"],
      ["https://x.com/i/grok", "grok"],
      ["chat.deepseek.com", "deepseek"],
      ["https://www.midjourney.com/imagine", "midjourney"],
      ["playground.com/create", "flux"],
      ["https://copilot.com/", "custom:copilot.com"],
      ["https://chat.mistral.ai/", "custom:chat.mistral.ai"],
      ["poe.com/chat", "custom:poe.com"],
      ["openai.com/index", "chatgpt"],
    ];
    for (const [input, expected] of samples) {
      const hit = resolvePlatformFromInput(input, full);
      expect(hit.ok && hit.id, input).toBe(expected);
    }
  });
});

describe("custom sites stay in the icon grid", () => {
  it("appends custom hosts as icon cells, not a separate chip row", () => {
    const items = buildPlatformGridItems(platforms, [
      "custom:copilot.com",
      "custom:poe.com",
    ]);
    expect(items.some((i) => i.id === "chatgpt" && i.kind === "known")).toBe(
      true,
    );
    const copilot = items.find((i) => i.id === "custom:copilot.com");
    expect(copilot).toMatchObject({
      kind: "custom",
      name: "copilot.com",
      faviconHost: "copilot.com",
    });
    expect(items.at(-1)?.id).toBe("custom:poe.com");
  });
});

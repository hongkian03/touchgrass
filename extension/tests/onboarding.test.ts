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
import {
  DEFAULT_STATE,
  estimateStorageBytes,
  formatStorageSize,
} from "../lib/storage";
import {
  buildPdfFromPng,
  buildReportCardSvg,
  rankForScore,
  slugifyName,
  symmetricPositions,
} from "../lib/reportCard";
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

describe("userName + local storage helpers", () => {
  it("DEFAULT_STATE includes empty userName", () => {
    expect(DEFAULT_STATE.userName).toBe("");
    expect(DEFAULT_STATE.onboarded).toBe(false);
  });

  it("estimateStorageBytes returns positive size for seeded state", () => {
    const bytes = estimateStorageBytes({
      ...DEFAULT_STATE,
      userName: "Ada",
      onboarded: true,
      enabledPlatforms: ["claude"],
      usage: [
        {
          ts: "2026-01-01T00:00:00.000Z",
          provider: "claude",
          model: "claude-haiku",
          kind: "text",
          prompt_text: "hi",
          regenerated: false,
        },
      ],
    });
    expect(bytes).toBeGreaterThan(40);
    expect(formatStorageSize(bytes)).toMatch(/B|KB/);
  });

  it("detects extension context invalidated errors", async () => {
    const {
      isExtensionContextAlive,
      isExtensionContextError,
      isExtensionStorageAlive,
    } = await import("../lib/storage");
    expect(
      isExtensionContextError(new Error("Extension context invalidated.")),
    ).toBe(true);
    expect(isExtensionContextError(new Error("other"))).toBe(false);
    // In vitest, browser.storage may be mocked or missing — just ensure no throw.
    expect(typeof isExtensionStorageAlive()).toBe("boolean");
    expect(typeof isExtensionContextAlive()).toBe("boolean");
  });
});

describe("onboarding Musky greeting copy", () => {
  it("says Hi I'm Musky not Pip", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const src = readFileSync(
      resolve(__dirname, "../components/InlineOnboarding.tsx"),
      "utf8",
    );
    expect(src).toMatch(/Hi! I'm Musky/);
    expect(src).toMatch(/Meet Musky, your AI footprint buddy/);
    expect(src).not.toMatch(/Hi! I'm Pip/);
  });
});

describe("onboarding Jitter convergence choreography", () => {
  it("wires Step 1 splash + Step 3 finale classes without dropping testids", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const inline = readFileSync(
      resolve(__dirname, "../components/InlineOnboarding.tsx"),
      "utf8",
    );
    const css = readFileSync(
      resolve(__dirname, "../assets/puddle.css"),
      "utf8",
    );

    expect(css).toMatch(/\.jt-stage-card/);
    expect(css).toMatch(/\.jt-mascot-hero/);
    expect(css).toMatch(/\.jt-orbit-badge/);
    expect(css).toMatch(/\.jt-bubble-pop/);
    expect(css).toMatch(/\.jt-slot-up/);
    expect(css).toMatch(/\.jt-card-left/);
    expect(css).toMatch(/\.jt-card-right/);

    expect(inline).toMatch(/jt-stage-card/);
    expect(inline).toMatch(/jt-mascot-hero/);
    expect(inline).toMatch(/jt-orbit-badge/);
    expect(inline).toMatch(/onboarding-hero-stage/);
    expect(inline).toMatch(/onboarding-finale-stage/);
    expect(inline).toMatch(/Watched by Musky/);
    expect(inline).toMatch(/EcoSatellites/);
    expect(inline).toMatch(/ChosenPlatformOrbit/);
    // Critical: form controls stay mounted (no delayed unmount splash)
    expect(inline).toMatch(/data-testid="onboarding-name"/);
    expect(inline).toMatch(/testId="got-it"/);
  });
});

describe("achievement report card + PDF", () => {
  it("ranks scores and slugifies names", () => {
    expect(rankForScore(90)).toBe("Lush Lawn Legend");
    expect(rankForScore(50)).toBe("Sapling Guardian");
    expect(rankForScore(30)).toBe("Fresh Sprout");
    expect(rankForScore(10)).toBe("Dry Patch");
    expect(slugifyName("Ada Lovelace")).toBe("ada-lovelace");
  });

  it("symmetrically centers tree positions around 540", () => {
    const pos4 = symmetricPositions(4, 540, 128);
    expect(pos4).toHaveLength(4);
    const mean4 = pos4.reduce((a, b) => a + b, 0) / pos4.length;
    expect(mean4).toBe(540);
    expect(pos4[0] + pos4[3]).toBe(1080);
    expect(pos4[1] + pos4[2]).toBe(1080);
  });

  it("builds SVG card with name + trees + score", () => {
    const svg = buildReportCardSvg({
      userName: "Ada",
      score: 88,
      streak: 4,
      trees: 2.5,
      smallPct: 40,
      energyWh: 1.2,
      waterL: 0.05,
      co2g: 0.8,
      platforms: ["Claude", "ChatGPT"],
      dateLabel: "Oct 17, 2026",
    });
    expect(svg).toMatch(/Ada's Report/);
    expect(svg).toMatch(/Lush Lawn Legend/);
    expect(svg).toMatch(/88/);
    expect(svg).toMatch(/Touchgrass Passport/);
    expect(svg).toMatch(/sticker-gotit\.png/);
  });

  it("embeds JPEG into a valid PDF byte stream", () => {
    // Minimal JPEG SOI + EOI with a few filler bytes (enough for header check).
    const jpeg = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
      0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
    ]);
    const pdf = buildPdfFromPng(jpeg, 1080, 1350);
    const head = String.fromCharCode(...pdf.slice(0, 8));
    expect(head).toBe("%PDF-1.4");
    expect(pdf.length).toBeGreaterThan(jpeg.length + 80);
    const tail = String.fromCharCode(...pdf.slice(-6));
    expect(tail).toContain("EOF");
  });
});

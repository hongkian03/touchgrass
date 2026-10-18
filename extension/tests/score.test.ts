import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { classify } from "../lib/classify";
import { route, routeTargetHost } from "../lib/route";
import { monthWindow, score, wastePenalty, weekWindow } from "../lib/score";
import type { Platform, UsageRow } from "../lib/types";

// Hand-computed weights from issue #3 — duplicated here on purpose.
// Do NOT import waste constants from src.
const OVERSIZED = 15;
const REGEN = 5;
const IMAGE = 25;
const VIDEO = 40;

const platforms: Platform[] = [
  {
    id: "chatgpt",
    name: "ChatGPT",
    hosts: ["https://chatgpt.com/*"],
    icon: "chatgpt",
    defaultModel: "gpt-5",
    smallModel: "gpt-4o-mini",
    kind: "text",
  },
  {
    id: "claude",
    name: "Claude",
    hosts: ["https://claude.ai/*"],
    icon: "claude",
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
    id: "perplexity",
    name: "Perplexity",
    hosts: ["https://www.perplexity.ai/*"],
    icon: "perplexity",
    defaultModel: "sonar-pro",
    smallModel: "sonar",
    kind: "text",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    hosts: ["https://chat.deepseek.com/*"],
    icon: "deepseek",
    defaultModel: "deepseek-chat",
    smallModel: "deepseek-chat",
    kind: "text",
  },
];

const today = new Date(2026, 9, 17, 15, 0, 0);
const ts = today.toISOString();

function row(partial: Partial<UsageRow> & Pick<UsageRow, "prompt_text" | "model" | "kind">): UsageRow {
  return {
    ts,
    provider: "chatgpt",
    regenerated: false,
    ...partial,
  };
}

describe("C5b classify everyday asks", () => {
  it.each([
    "hello claude how are you",
    "what time is it",
    "what time is it in Tokyo",
    "hi",
  ])("%s -> small_ok", (p) => {
    expect(classify(p, "text")).toBe("small_ok");
  });

  it.each([
    "write a cover letter for a product design internship",
    "debug this: const x = foo();",
    "",
  ])("%s -> needs_big", (p) => {
    expect(classify(p, "text")).toBe("needs_big");
  });
});

describe("C5 classify happy path", () => {
  it('classify("what\'s the weather in Boston", "text") -> small_ok', () => {
    expect(classify("what's the weather in Boston", "text")).toBe("small_ok");
  });

  it("classify define / translate / who-is -> small_ok", () => {
    expect(classify("define photosynthesis", "text")).toBe("small_ok");
    expect(classify("translate hello to spanish", "text")).toBe("small_ok");
    expect(classify("who is ada lovelace", "text")).toBe("small_ok");
  });

  it("classify long coding ask -> needs_big", () => {
    expect(
      classify(
        "refactor this typescript module with generics and tests",
        "text",
      ),
    ).toBe("needs_big");
  });
});

describe("C1 two oversized simple prompts", () => {
  it("15+15 = 30 penalty, score 70", () => {
    const rows: UsageRow[] = [
      row({
        prompt_text: "what is photosynthesis",
        model: "gpt-5",
        kind: "text",
      }),
      row({
        prompt_text: "define entropy briefly",
        model: "gpt-5",
        kind: "text",
      }),
    ];
    // Hand math: OVERSIZED + OVERSIZED
    const expectedPenalty = OVERSIZED + OVERSIZED;
    expect(expectedPenalty).toBe(30);
    expect(wastePenalty(rows, today, platforms)).toBe(expectedPenalty);
    expect(score(rows, today, platforms)).toBe(100 - expectedPenalty);
    expect(score(rows, today, platforms)).toBe(70);
  });
});

describe("C2 regen + image", () => {
  it("5+25 = 30 penalty, score 70", () => {
    const rows: UsageRow[] = [
      row({
        // needs_big so we do not also add OVERSIZED
        prompt_text:
          "Refactor the entire payment orchestrator with saga compensation across regions",
        model: "gpt-5",
        kind: "text",
        regenerated: true,
      }),
      row({
        prompt_text: "watercolor fox",
        model: "dall-e-3",
        kind: "image",
        provider: "dalle",
      }),
    ];
    const expectedPenalty = REGEN + IMAGE;
    expect(expectedPenalty).toBe(30);
    expect(wastePenalty(rows, today, platforms)).toBe(expectedPenalty);
    expect(score(rows, today, platforms)).toBe(70);
  });
});

describe("C3 one video", () => {
  it("40 penalty, score 60", () => {
    const rows: UsageRow[] = [
      row({
        prompt_text: "cinematic drone",
        model: "video-gen",
        kind: "video",
      }),
    ];
    expect(VIDEO).toBe(40);
    expect(wastePenalty(rows, today, platforms)).toBe(VIDEO);
    expect(score(rows, today, platforms)).toBe(60);
  });
});

describe("C4 empty day", () => {
  it("score 100", () => {
    expect(score([], today, platforms)).toBe(100);
    expect(wastePenalty([], today, platforms)).toBe(0);
  });
});

describe("C6 holdout evals", () => {
  const evals = JSON.parse(
    readFileSync(resolve(__dirname, "../data/evals.json"), "utf8"),
  ) as {
    rows: { prompt_text: string; kind: "text" | "image" | "video"; label: string }[];
  };

  const HOLD_RE =
    /what is|what's|whats|who is|weather|define|translate|summarize|how many|capital of|look up|lookup/i;

  it("has at least 8 prompts without the small-hint regex", () => {
    const holdouts = evals.rows.filter((r) => !HOLD_RE.test(r.prompt_text));
    expect(holdouts.length).toBeGreaterThanOrEqual(8);
  });

  it("recomputed accuracy >= 0.7 (not the JSON accuracy field)", () => {
    let correct = 0;
    for (const r of evals.rows) {
      if (classify(r.prompt_text, r.kind) === r.label) correct += 1;
    }
    const accuracy = correct / evals.rows.length;
    expect(accuracy).toBeGreaterThanOrEqual(0.7);
  });
});

describe("C7 routing never DeepSeek as green", () => {
  it("small_ok + frontier gpt-5 does not open chat.deepseek.com", () => {
    const suggestion = route({
      promptClass: "small_ok",
      model: "gpt-5",
      provider: "chatgpt",
      platforms,
      enabledPlatforms: ["chatgpt", "gemini"],
    });
    const host = routeTargetHost(suggestion);
    expect(host).not.toBe("chat.deepseek.com");
    if (suggestion.targetUrl) {
      expect(suggestion.targetUrl).not.toMatch(/deepseek/i);
    }
    expect(suggestion.action).toBe("switch_model");
    expect(suggestion.targetModel).toBe("gpt-4o-mini");
  });

  it("small_ok unknown provider + empty enabled does not invent Mistral or DeepSeek", () => {
    const suggestion = route({
      promptClass: "small_ok",
      model: "mystery-xl",
      provider: "unknown",
      platforms,
      enabledPlatforms: [],
    });
    expect(suggestion.action).toBe("switch_model");
    expect(routeTargetHost(suggestion)).not.toBe("chat.mistral.ai");
    expect(suggestion.targetUrl ?? "").not.toMatch(/deepseek/i);
  });

  it("ChatGPT already on small + gemini enabled → open gemini", () => {
    const suggestion = route({
      promptClass: "small_ok",
      model: "gpt-4o-mini",
      provider: "chatgpt",
      platforms,
      enabledPlatforms: ["chatgpt", "gemini"],
    });
    expect(suggestion.action).toBe("open_paste");
    expect(routeTargetHost(suggestion)).toBe("gemini.google.com");
  });

  it("Claude already on haiku + perplexity enabled → open perplexity", () => {
    const suggestion = route({
      promptClass: "small_ok",
      model: "claude-haiku",
      provider: "claude",
      platforms,
      enabledPlatforms: ["claude", "perplexity"],
    });
    expect(suggestion.action).toBe("open_paste");
    expect(routeTargetHost(suggestion)).toMatch(/perplexity\.ai/);
  });

  it("only chatgpt enabled and already on small → no DeepSeek / no Mistral", () => {
    const suggestion = route({
      promptClass: "small_ok",
      model: "gpt-4o-mini",
      provider: "chatgpt",
      platforms,
      enabledPlatforms: ["chatgpt"],
    });
    expect(suggestion.action).toBe("switch_model");
    expect(suggestion.targetUrl ?? "").not.toMatch(/mistral|deepseek/i);
  });

  it("deepseek-only alternate is skipped", () => {
    const suggestion = route({
      promptClass: "small_ok",
      model: "gpt-4o-mini",
      provider: "chatgpt",
      platforms,
      enabledPlatforms: ["chatgpt", "deepseek"],
    });
    expect(suggestion.targetUrl ?? "").not.toMatch(/deepseek/i);
    expect(routeTargetHost(suggestion)).not.toBe("chat.deepseek.com");
  });
});

describe("weekWindow", () => {
  it("returns 7 local date keys ending today", () => {
    const keys = weekWindow(today);
    expect(keys).toHaveLength(7);
    expect(keys[0]).toBe("2026-10-17");
    expect(keys[6]).toBe("2026-10-11");
  });

  it("month window is 30 days ending today", () => {
    const keys = monthWindow(today);
    expect(keys).toHaveLength(30);
    expect(keys[0]).toBe("2026-10-17");
    expect(keys[29]).toBe("2026-09-18");
  });
});

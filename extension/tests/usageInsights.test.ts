import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import platformsData from "../data/platforms.json";
import { rowsInLastDays, usageInsightCards } from "../lib/usageInsights";
import type { Platform, UsageRow } from "../lib/types";

const platforms = platformsData as Platform[];
const today = new Date(2026, 9, 18, 15, 0, 0);

function row(daysAgo: number, partial: Partial<UsageRow> = {}): UsageRow {
  const d = new Date(today);
  d.setDate(d.getDate() - daysAgo);
  return {
    ts: d.toISOString(),
    provider: "chatgpt",
    model: "gpt-5",
    kind: "text",
    prompt_text: "what time is it",
    regenerated: false,
    ...partial,
  };
}

describe("rowsInLastDays", () => {
  it("rolling window: 7 days includes today and 6 back, not 7 back", () => {
    const rows = [row(0), row(6), row(7), row(29), row(30)];
    expect(rowsInLastDays(rows, today, 7)).toHaveLength(2);
    expect(rowsInLastDays(rows, today, 30)).toHaveLength(4);
  });
});

describe("usageInsightCards", () => {
  it("empty history → says nothing is recorded, no numbers", () => {
    const cards = usageInsightCards([], today, platforms, 7);
    expect(cards).toHaveLength(1);
    expect(cards[0]!.text).toMatch(/No prompts recorded in the last 7 days/);
    expect(cards[0]!.text).not.toMatch(/\d+%/);
  });

  it("computes the small-ask share and regenerates from real rows", () => {
    const rows = [
      row(0),
      row(1),
      row(2, { prompt_text: "debug this race condition in my queue" }),
      row(3, { prompt_text: "write a cover letter", regenerated: true }),
    ];
    const cards = usageInsightCards(rows, today, platforms, 7);
    expect(cards.find((c) => c.id === "small-enough")!.text).toBe(
      "50% of your 4 prompts in the last 7 days were simple questions a small model could answer.",
    );
    expect(cards.find((c) => c.id === "regenerates")!.text).toBe(
      "You regenerated 1 answer in the last 7 days.",
    );
    expect(cards.find((c) => c.id === "top-site")!.text).toBe(
      "Most used in the last 7 days: ChatGPT (4 of 4).",
    );
  });

  it("canned demo stats are gone from popup and dashboard", () => {
    for (const f of ["../entrypoints/popup/App.tsx", "../entrypoints/dashboard/App.tsx"]) {
      const src = readFileSync(resolve(__dirname, f), "utf8");
      expect(src).not.toMatch(/usage-seed\.json/);
      expect(src).not.toMatch(/seedInsights/);
    }
    const seedTips = readFileSync(resolve(__dirname, "../data/insights.json"), "utf8");
    expect(seedTips).not.toMatch(/38%|12 times/);
  });
});

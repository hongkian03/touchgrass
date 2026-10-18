import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  FOOTPRINT_MODELS,
  GOOGLE_GEMINI_MEDIAN,
  OPENAI_CHATGPT_AVG,
  SMALL_MODEL_FRACTION,
  TREE_CO2_G_PER_YEAR,
  treeMinutesFromCo2G,
} from "../lib/footprint";
import { daySavings } from "../lib/savings";
import type { FootprintModel } from "../lib/totals";
import type { Platform, UsageRow } from "../lib/types";

const platforms: Platform[] = [
  {
    id: "chatgpt",
    name: "ChatGPT",
    hosts: ["https://chatgpt.com/*"],
    icon: "openai-chatgpt",
    defaultModel: "gpt-5",
    smallModel: "gpt-4o-mini",
    kind: "text",
  },
];

const models: Record<string, FootprintModel> = {
  "gpt-5": { Wh: 2.4, water_L: 0.04, co2_g: 1.1 },
  "gpt-4o-mini": { Wh: 0.3, water_L: 0.005, co2_g: 0.14 },
};

const today = new Date(2026, 9, 17, 15, 0, 0);

function row(model: string): UsageRow {
  return {
    ts: today.toISOString(),
    provider: "chatgpt",
    model,
    kind: "text",
    prompt_text: "weather in Boston",
    regenerated: false,
  };
}

describe("daySavings vs default model", () => {
  it("mini vs gpt-5: 2.1 Wh, 0.035 L, 0.96 g", () => {
    // Hand: 2.4-0.3, 0.04-0.005, 1.1-0.14
    const s = daySavings([row("gpt-4o-mini")], today, platforms, models);
    expect(s.Wh).toBeCloseTo(2.1);
    expect(s.water_L).toBeCloseTo(0.035);
    expect(s.co2_g).toBeCloseTo(0.96);
  });

  it("already on default model saves nothing", () => {
    const s = daySavings([row("gpt-5")], today, platforms, models);
    expect(s.Wh).toBe(0);
    expect(s.water_L).toBe(0);
    expect(s.co2_g).toBe(0);
  });
});

describe("tree-minutes", () => {
  it("22 kg CO2/tree/yr → 1 g ≈ 23.9 tree-minutes; 0 → 0", () => {
    expect(TREE_CO2_G_PER_YEAR).toBe(22_000);
    // 525,600 min/yr ÷ 22,000 g/yr
    expect(treeMinutesFromCo2G(1)).toBeCloseTo(23.89, 1);
    expect(treeMinutesFromCo2G(0)).toBe(0);
  });
});

describe("published per-prompt figures", () => {
  it("Gemini = Google Aug 2025 median: 0.24 Wh, 0.26 mL, 0.03 g", () => {
    expect(GOOGLE_GEMINI_MEDIAN).toEqual({ Wh: 0.24, water_mL: 0.26, co2_g: 0.03 });
    const g = FOOTPRINT_MODELS["gemini-pro"];
    expect(g.Wh).toBeCloseTo(0.24);
    expect(g.water_L * 1000).toBeCloseTo(0.26);
    expect(g.co2_g).toBeCloseTo(0.03);
  });

  it("ChatGPT = OpenAI Jun 2025 average: 0.34 Wh, 0.32 mL; CO2 derived at 0.125 g/Wh", () => {
    expect(OPENAI_CHATGPT_AVG.Wh).toBe(0.34);
    expect(OPENAI_CHATGPT_AVG.water_mL).toBe(0.32);
    const c = FOOTPRINT_MODELS["gpt-5"];
    expect(c.Wh).toBeCloseTo(0.34);
    expect(c.water_L * 1000).toBeCloseTo(0.32);
    expect(c.co2_g).toBeCloseTo(0.0425);
  });

  it("Claude = midpoint estimate, inside the Google–OpenAI range", () => {
    const c = FOOTPRINT_MODELS["claude-opus"];
    expect(c.Wh).toBeCloseTo(0.29);
    expect(c.Wh).toBeGreaterThanOrEqual(0.24);
    expect(c.Wh).toBeLessThanOrEqual(0.34);
  });

  it("small models are the labeled fraction of their big model", () => {
    expect(FOOTPRINT_MODELS["gpt-4o-mini"].Wh).toBeCloseTo(
      0.34 * SMALL_MODEL_FRACTION,
    );
    expect(FOOTPRINT_MODELS["claude-haiku"].Wh).toBeCloseTo(
      0.29 * SMALL_MODEL_FRACTION,
    );
  });
});

describe("cartoon palette", () => {
  const src = () =>
    readFileSync(resolve(__dirname, "../components/FootprintCartoons.tsx"), "utf8");

  it("hand-drawn icons use only ink + paper (theme vars with fallbacks)", () => {
    const hexes = [...src().matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0].toLowerCase());
    expect(new Set(hexes)).toEqual(new Set(["#161616", "#faf8f2"]));
    expect(src()).toContain("var(--tg-ink, #161616)");
  });

  it("keeps every motion class, drops the cartoon faces", () => {
    for (const cls of ["ft-glow", "ft-orbit", "ft-spark", "ft-bolt", "ft-drop", "ft-ripple", "ft-splash", "ft-drip", "ft-cloud", "ft-puffball", "ft-tree", "ft-sway", "ft-leaf"]) {
      expect(src(), cls).toContain(`"${cls}`);
    }
    expect(src()).not.toMatch(/ft-eye/);
  });
});

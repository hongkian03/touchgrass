import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  G_CO2_PER_SAPLING,
  daySavings,
  saplingsFromCo2G,
} from "../lib/savings";
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

describe("saplingsFromCo2G", () => {
  it("0.5 g → 1 sapling (labeled demo rate)", () => {
    expect(G_CO2_PER_SAPLING).toBe(0.5);
    expect(saplingsFromCo2G(0.96)).toBe(1.9);
    expect(saplingsFromCo2G(0)).toBe(0);
  });
});

describe("cartoon palette", () => {
  it("cartoons use real energy/water/tree/CO2 colors", () => {
    const ALLOWED = [
      "#fff3c4",
      "#f5c400",
      "#ffe566",
      "#8a5a00",
      "#d6f0ff",
      "#2ba4e0",
      "#9ad8f5",
      "#0b4f74",
      "#eef1f4",
      "#c5cdd4",
      "#8e99a4",
      "#4a5560",
      "#e4f5d8",
      "#5cb85c",
      "#3d8b40",
      "#8fd18f",
      "#8b5a2b",
      "#2d5a27",
    ];
    const src = readFileSync(
      resolve(__dirname, "../components/FootprintCartoons.tsx"),
      "utf8",
    );
    const hexes = [...src.matchAll(/#[0-9a-fA-F]{3,8}/g)].map((m) =>
      m[0].toLowerCase(),
    );
    const allowed = new Set(ALLOWED.map((h) => h.toLowerCase()));
    expect(hexes.length).toBeGreaterThan(0);
    for (const hex of hexes) {
      expect(allowed.has(hex), `illegal hex ${hex}`).toBe(true);
    }
  });
});

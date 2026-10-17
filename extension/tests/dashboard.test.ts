import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import evalsData from "../data/evals.json";
import insights from "../data/insights.json";
import { recomputeAccuracy } from "../lib/evalAccuracy";
import {
  DASHBOARD_COLUMN_WIDTH,
  DASHBOARD_MAX_WIDTH,
  DASHBOARD_MIN_WIDTH,
} from "../lib/layout";
import { parseVoiceIntent } from "../lib/voiceIntent";
import { routeTargetHost } from "../lib/route";
import type { Platform } from "../lib/types";

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

describe("dashboard layout (#6)", () => {
  it("column width is 720–880", () => {
    // Recorded walk width: 800 (inside 720–880).
    expect(DASHBOARD_MIN_WIDTH).toBe(720);
    expect(DASHBOARD_MAX_WIDTH).toBe(880);
    expect(DASHBOARD_COLUMN_WIDTH).toBe(800);
    expect(DASHBOARD_COLUMN_WIDTH).toBeGreaterThanOrEqual(720);
    expect(DASHBOARD_COLUMN_WIDTH).toBeLessThanOrEqual(880);
    const app = readFileSync(
      resolve(__dirname, "../entrypoints/dashboard/App.tsx"),
      "utf8",
    );
    expect(app).toMatch(/DASHBOARD_MIN_WIDTH/);
    expect(app).toMatch(/DASHBOARD_MAX_WIDTH/);
    expect(app).toMatch(/DASHBOARD_COLUMN_WIDTH/);
  });

  it("shows three insights from insights.json", () => {
    expect(insights).toHaveLength(3);
    const app = readFileSync(
      resolve(__dirname, "../entrypoints/dashboard/App.tsx"),
      "utf8",
    );
    expect(app).toMatch(/insights\.slice\(0,\s*3\)/);
  });
});

describe("eval accuracy recomputed", () => {
  it("hand: 30/30 = 1.0 and matches recomputeAccuracy", () => {
    // Hand-run classify over evals.json rows → 30 correct / 30 total = 1
    const HAND_CORRECT = 30;
    const HAND_TOTAL = 30;
    const HAND_ACC = 1;
    const live = recomputeAccuracy(
      (
        evalsData as {
          rows: Array<{ prompt_text: string; kind: string; label: string }>;
        }
      ).rows,
    );
    expect(live.correct).toBe(HAND_CORRECT);
    expect(live.total).toBe(HAND_TOTAL);
    expect(live.accuracy).toBe(HAND_ACC);
  });
});

describe("voice intents", () => {
  it("Hey Pip weekly report → recap", () => {
    expect(parseVoiceIntent("Hey Pip weekly report", platforms).kind).toBe(
      "recap",
    );
  });

  it("weather path host is not DeepSeek", () => {
    const intent = parseVoiceIntent("what's today's weather", platforms);
    expect(intent.kind).toBe("weather");
    if (intent.kind === "weather") {
      expect(routeTargetHost(intent.suggestion)).not.toBe("chat.deepseek.com");
      expect(intent.suggestion.targetUrl ?? "").not.toMatch(/deepseek/i);
    }
  });
});

describe("pip-recap command", () => {
  it("manifest suggests Alt+Shift+P", () => {
    const cfg = readFileSync(resolve(__dirname, "../wxt.config.ts"), "utf8");
    expect(cfg).toMatch(/pip-recap/);
    expect(cfg).toMatch(/Alt\+Shift\+P/);
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  COACH_BUBBLE_MAX,
  coachBottomPx,
  coachNeverDeepSeek,
  shouldShowCoach,
  COACH_HIDE_MS,
} from "../lib/coach";
import { buildCoachSuggestion } from "../lib/coachYes";
import { routeTargetHost } from "../lib/route";

// Issue #5 test law — five allowed hexes as literals.
const ALLOWED = [
  "#62b6cb",
  "#bee9e8",
  "#1b4965",
  "#5fa8d3",
  "#cae9ff",
] as const;

describe("PipSvg token-only fills", () => {
  const src = readFileSync(
    resolve(__dirname, "../components/PipSvg.tsx"),
    "utf8",
  );

  it("every fill/stroke/stop-color hex is one of the five palette colors", () => {
    const attrs = [
      ...src.matchAll(
        /(?:fill|stroke|stop-color)\s*=\s*["'](#[0-9a-fA-F]{3,8})["']/g,
      ),
    ].map((m) => m[1].toLowerCase());
    const consts = [
      ...src.matchAll(
        /(?:BODY|BELLY|FACE|CHEEK|FIELD)\s*=\s*["'](#[0-9a-fA-F]{3,8})["']/g,
      ),
    ].map((m) => m[1].toLowerCase());
    const all = [...attrs, ...consts];
    expect(all.length).toBeGreaterThan(0);
    const allowed = new Set(ALLOWED.map((h) => h.toLowerCase()));
    for (const hex of all) {
      expect(allowed.has(hex), `illegal hex ${hex}`).toBe(true);
    }
  });

  it("lists each of the five allowed hexes", () => {
    for (const hex of ALLOWED) {
      expect(src.toLowerCase()).toContain(hex.toLowerCase());
    }
  });
});

describe("coach bubble + hide", () => {
  it("bubble max is 240", () => {
    expect(COACH_BUBBLE_MAX).toBe(240);
    const overlay = readFileSync(
      resolve(__dirname, "../components/CoachOverlay.tsx"),
      "utf8",
    );
    expect(overlay).toMatch(/COACH_BUBBLE_MAX|maxWidth:\s*COACH_BUBBLE_MAX/);
  });

  it("overlay is top-right toast with chip, no pet, no Yes/No", () => {
    const overlay = readFileSync(
      resolve(__dirname, "../components/CoachOverlay.tsx"),
      "utf8",
    );
    expect(overlay).not.toMatch(/coach-yes/);
    expect(overlay).not.toMatch(/coach-no/);
    expect(overlay).not.toMatch(/PipSvg/);
    expect(overlay).toMatch(/coach-redirect-chip/);
    expect(overlay).toMatch(/COACH_TOP/);
    expect(overlay).toMatch(/COACH_RIGHT/);
  });

  it("content watches typing with debounce", () => {
    const content = readFileSync(
      resolve(__dirname, "../entrypoints/content.ts"),
      "utf8",
    );
    expect(content).toMatch(/COACH_TYPE_DEBOUNCE_MS/);
    expect(content).toMatch(/addEventListener\(["']input["']/);
  });

  it("hides for 10 minutes after lastCoachAt", () => {
    const now = 1_700_000_000_000;
    expect(shouldShowCoach(0, now)).toBe(true);
    expect(shouldShowCoach(now - 1000, now)).toBe(false);
    expect(shouldShowCoach(now - COACH_HIDE_MS - 1, now)).toBe(true);
  });

  it("coachBottomPx with null stays default", () => {
    expect(coachBottomPx(null)).toBe(16);
  });
});

describe("auto coach never DeepSeek", () => {
  it("weather draft on chatgpt switches model, not DeepSeek", () => {
    const s = buildCoachSuggestion({
      draft: "what's the weather in Boston",
      model: "gpt-5",
      provider: "chatgpt",
    });
    expect(coachNeverDeepSeek(s)).toBe(true);
    expect(routeTargetHost(s)).not.toBe("chat.deepseek.com");
    expect(s.targetUrl ?? "").not.toMatch(/deepseek/i);
  });
});

describe("fixture + Try Pip wiring", () => {
  it("fixture has composer + model-label and auto coach", () => {
    const app = readFileSync(
      resolve(__dirname, "../entrypoints/fixture/App.tsx"),
      "utf8",
    );
    expect(app).toMatch(/id=["']composer["']/);
    expect(app).toMatch(/id=["']model-label["']/);
    expect(app).toMatch(/what's the weather in Boston/);
    expect(app).toMatch(/planCoachAuto/);
  });

  it("dashboard exposes Try Pip", () => {
    const dash = readFileSync(
      resolve(__dirname, "../entrypoints/dashboard/App.tsx"),
      "utf8",
    );
    expect(dash).toMatch(/Try Pip/);
    expect(dash).toMatch(/fixture\.html/);
  });
});

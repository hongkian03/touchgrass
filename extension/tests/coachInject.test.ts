import { describe, expect, it } from "vitest";
import {
  allPlatformMatchPatterns,
  injectPatternsForEnabled,
  COACH_SCRIPT_FILE,
  COACH_SCRIPT_ID,
} from "../lib/coachInject";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("coach inject patterns", () => {
  it("includes all major chat hosts", () => {
    const m = allPlatformMatchPatterns();
    expect(m).toEqual(
      expect.arrayContaining([
        "https://chatgpt.com/*",
        "https://claude.ai/*",
        "https://gemini.google.com/*",
        "https://www.perplexity.ai/*",
        "https://grok.com/*",
      ]),
    );
    expect(COACH_SCRIPT_ID).toBe("puddle-coach");
    expect(COACH_SCRIPT_FILE).toMatch(/content\.js/);
  });

  it("enabled subset maps to those hosts only", () => {
    const m = injectPatternsForEnabled(["claude", "gemini"]);
    expect(m).toContain("https://claude.ai/*");
    expect(m).toContain("https://gemini.google.com/*");
    expect(m).not.toContain("https://chatgpt.com/*");
  });
});

describe("findComposer", () => {
  it("prefers ProseMirror and chat-input selectors first", () => {
    const src = readFileSync(
      resolve(__dirname, "../lib/findComposer.ts"),
      "utf8",
    );
    expect(src).toMatch(/chat-input/);
    expect(src).toMatch(/ProseMirror/);
    const preferBlock = src.slice(
      src.indexOf("const prefer"),
      src.indexOf("for (const sel"),
    );
    expect(preferBlock.indexOf("chat-input")).toBeLessThan(
      preferBlock.indexOf("ProseMirror"),
    );
  });
});

describe("content + background wiring", () => {
  it("content matches all platforms and watches input", () => {
    const src = readFileSync(
      resolve(__dirname, "../entrypoints/content.ts"),
      "utf8",
    );
    expect(src).toMatch(/allPlatformMatchPatterns/);
    expect(src).toMatch(/findComposer/);
    expect(src).toMatch(/needAnotherPlatform/);
  });

  it("background rebinds on permission and message", () => {
    const src = readFileSync(
      resolve(__dirname, "../entrypoints/background.ts"),
      "utf8",
    );
    expect(src).toMatch(/rebindCoachScripts/);
    expect(src).toMatch(/puddle\/coach-rebind/);
    expect(src).toMatch(/permissions\.onAdded/);
  });

  it("onboarding sends coach-rebind after finish", () => {
    const src = readFileSync(
      resolve(__dirname, "../entrypoints/onboarding/App.tsx"),
      "utf8",
    );
    expect(src).toMatch(/puddle\/coach-rebind/);
  });
});

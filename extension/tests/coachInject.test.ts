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
  it("content matches all platforms and starts coach watch", () => {
    const src = readFileSync(
      resolve(__dirname, "../entrypoints/content.ts"),
      "utf8",
    );
    expect(src).toMatch(/allPlatformMatchPatterns/);
    expect(src).toMatch(/startCoachWatch/);
    expect(src).not.toMatch(/registration:\s*["']runtime["']/);
  });

  it("startCoachWatch uses document capture + Groq route", () => {
    const src = readFileSync(
      resolve(__dirname, "../lib/startCoachWatch.ts"),
      "utf8",
    );
    expect(src).toMatch(/document\.addEventListener/);
    expect(src).toMatch(/puddle\/route-query/);
    expect(src).toMatch(/findComposer/);
    expect(src).toMatch(/adapter-get/);
    expect(src).toMatch(/holdSend/);
    expect(src).toMatch(/resolveActiveSite/);
    expect(src).toMatch(/\[Touchgrass\] route/);
  });

  it("startCoachWatch intercepts Enter and logs watching", () => {
    const src = readFileSync(
      resolve(__dirname, "../lib/startCoachWatch.ts"),
      "utf8",
    );
    expect(src).toMatch(/addEventListener\(\s*["']keydown["']/);
    expect(src).toMatch(/ev\.key\s*!==\s*["']Enter["']/);
    expect(src).toMatch(/\[Touchgrass\] watching/);
    expect(src).toMatch(/sendBypassOnce/);
    expect(src).toMatch(/clearDebounce/);
  });

  it("background rebinds on permission and message", () => {
    const src = readFileSync(
      resolve(__dirname, "../entrypoints/background.ts"),
      "utf8",
    );
    expect(src).toMatch(/rebindCoachScripts/);
    expect(src).toMatch(/puddle\/coach-rebind/);
    expect(src).toMatch(/puddle\/route-query/);
    expect(src).toMatch(/adapter-repair/);
    expect(src).toMatch(/permissions\.onAdded/);
  });

  it("coach-open-paste pastes then sends Enter", () => {
    const src = readFileSync(
      resolve(__dirname, "../entrypoints/background.ts"),
      "utf8",
    );
    expect(src).toMatch(/puddle\/coach-open-paste/);
    expect(src).toMatch(/insertText/);
    expect(src).toMatch(/pressSend|Send message/);
    expect(src).toMatch(/key:\s*["']Enter["']/);
  });

  it("BrandIcon resolves gemini via runtime.getURL", () => {
    const src = readFileSync(
      resolve(__dirname, "../components/BrandIcon.tsx"),
      "utf8",
    );
    expect(src).toMatch(/icons\/gemini\.svg/);
    expect(src).toMatch(/runtime\.getURL/);
  });

  it("onboarding sends coach-rebind after finish", () => {
    const src = readFileSync(
      resolve(__dirname, "../entrypoints/onboarding/App.tsx"),
      "utf8",
    );
    expect(src).toMatch(/puddle\/coach-rebind/);
  });

  it("inline popup onboarding also rebinds coach", () => {
    const src = readFileSync(
      resolve(__dirname, "../components/InlineOnboarding.tsx"),
      "utf8",
    );
    expect(src).toMatch(/puddle\/coach-rebind/);
    expect(src).toMatch(/onboarding-name/);
  });
});

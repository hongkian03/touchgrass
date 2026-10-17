import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ONBOARDING_MAX_WIDTH,
  POPUP_HEIGHT,
  POPUP_WIDTH,
  POPUP_WIDTH_TOLERANCE,
} from "../lib/layout";

describe("layout constants (issue #4)", () => {
  it("popup is 360 x 520", () => {
    expect(POPUP_WIDTH).toBe(360);
    expect(POPUP_HEIGHT).toBe(520);
    expect(POPUP_WIDTH_TOLERANCE).toBe(4);
  });

  it("onboarding column max is 420", () => {
    expect(ONBOARDING_MAX_WIDTH).toBe(420);
  });

  it("popup App uses POPUP_WIDTH / POPUP_HEIGHT", () => {
    const src = readFileSync(
      resolve(__dirname, "../entrypoints/popup/App.tsx"),
      "utf8",
    );
    expect(src).toMatch(/POPUP_WIDTH/);
    expect(src).toMatch(/POPUP_HEIGHT/);
    expect(src).not.toMatch(/width:\s*360\b/);
  });

  it("onboarding App uses ONBOARDING_MAX_WIDTH", () => {
    const src = readFileSync(
      resolve(__dirname, "../entrypoints/onboarding/App.tsx"),
      "utf8",
    );
    expect(src).toMatch(/ONBOARDING_MAX_WIDTH/);
    expect(src).not.toMatch(/maxWidth:\s*420\b/);
  });
});

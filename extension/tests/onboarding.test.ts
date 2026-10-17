import { describe, expect, it } from "vitest";
import { canContinueOnboarding, hostsForPlatforms } from "../lib/hosts";
import type { Platform } from "../lib/types";

const platforms: Platform[] = [
  {
    id: "chatgpt",
    name: "ChatGPT",
    hosts: ["https://chatgpt.com/*", "https://chat.openai.com/*"],
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
});

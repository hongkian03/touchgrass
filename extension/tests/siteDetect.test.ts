import { describe, expect, it } from "vitest";
import { siteFromHostname, siteIdFromLabel } from "../lib/siteDetect";

describe("siteDetect", () => {
  it("maps known hosts without Groq", () => {
    expect(siteFromHostname("chatgpt.com")).toBe("chatgpt");
    expect(siteFromHostname("claude.ai")).toBe("claude");
    expect(siteFromHostname("gemini.google.com")).toBe("gemini");
  });

  it("maps Groq labels onto platform ids", () => {
    expect(siteIdFromLabel("ChatGPT", "chat.openai.com")).toBe("chatgpt");
    expect(siteIdFromLabel("Claude by Anthropic", "claude.ai")).toBe("claude");
    expect(siteIdFromLabel("Weird AI Chat", "weird-ai.example")).toMatch(
      /weird|ai|chat/,
    );
  });
});

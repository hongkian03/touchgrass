import { describe, expect, it } from "vitest";
import { coachTargetDisplay } from "../lib/coachTargetDisplay";
import { planCoachAuto } from "../lib/coachYes";
import { providerFromHostname } from "../lib/route";
import platformsData from "../data/platforms.json";
import type { Platform } from "../lib/types";

const platforms = platformsData as Platform[];

const geminiOnly: Platform[] = [
  {
    id: "gemini",
    name: "Gemini",
    hosts: ["https://gemini.google.com/*"],
    icon: "gemini",
    defaultModel: "gemini-pro",
    smallModel: "gemini-flash",
    kind: "text",
  },
];

describe("coachTargetDisplay", () => {
  it("names Gemini with brand icon", () => {
    const d = coachTargetDisplay("https://gemini.google.com/app", geminiOnly);
    expect(d.name).toBe("Gemini");
    expect(d.iconSlug).toBe("gemini");
  });

  it("names Mistral with favicon", () => {
    const d = coachTargetDisplay("https://chat.mistral.ai/");
    expect(d.name).toBe("Mistral");
    expect(d.faviconUrl).toMatch(/mistral/);
  });
});

describe("providerFromHostname", () => {
  it("maps claude.ai and chatgpt.com", () => {
    expect(providerFromHostname("claude.ai", platforms)).toBe("claude");
    expect(providerFromHostname("chatgpt.com", platforms)).toBe("chatgpt");
  });
});

describe("planCoachAuto", () => {
  it("switches on-page when modelLabel is present", () => {
    const label = { textContent: "GPT-5" } as HTMLElement;
    const plan = planCoachAuto({
      draft: "what's the weather in Boston",
      model: "gpt-5",
      provider: "chatgpt",
      modelLabel: label,
      enabledPlatforms: ["chatgpt", "gemini"],
    });
    expect(plan.kind).toBe("switched");
    if (plan.kind === "switched") {
      expect(plan.model).toMatch(/mini|small|haiku|flash/i);
    }
  });

  it("ChatGPT no label + gemini enabled → redirect gemini", () => {
    const plan = planCoachAuto({
      draft: "what's the weather in Boston",
      model: "gpt-5",
      provider: "chatgpt",
      enabledPlatforms: ["chatgpt", "gemini"],
    });
    expect(plan.kind).toBe("redirect");
    if (plan.kind === "redirect") {
      expect(plan.url).toMatch(/gemini\.google\.com/);
      expect(plan.url).not.toMatch(/deepseek|mistral/i);
      expect(plan.target.name).toBe("Gemini");
    }
  });

  it("Claude no label + perplexity enabled → redirect perplexity", () => {
    const plan = planCoachAuto({
      draft: "what's the weather in Boston",
      model: "claude-opus",
      provider: "claude",
      enabledPlatforms: ["claude", "perplexity"],
    });
    expect(plan.kind).toBe("redirect");
    if (plan.kind === "redirect") {
      expect(plan.url).toMatch(/perplexity\.ai/);
      expect(plan.target.name).toBe("Perplexity");
    }
  });

  it("only chatgpt enabled and no label → noop (no Mistral)", () => {
    const plan = planCoachAuto({
      draft: "what's the weather in Boston",
      model: "gpt-5",
      provider: "chatgpt",
      enabledPlatforms: ["chatgpt"],
    });
    // switch preferred but no label and no alternate → noop
    expect(plan.kind).toBe("noop");
  });

  it("never redirects to DeepSeek even if only alternate", () => {
    const plan = planCoachAuto({
      draft: "what's the weather in Boston",
      model: "gpt-5",
      provider: "chatgpt",
      enabledPlatforms: ["chatgpt", "deepseek"],
    });
    expect(plan.kind).toBe("noop");
  });
});

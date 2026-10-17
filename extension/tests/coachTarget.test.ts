import { describe, expect, it } from "vitest";
import { coachTargetDisplay } from "../lib/coachTargetDisplay";
import { planCoachAuto } from "../lib/coachYes";
import type { Platform } from "../lib/types";

const platforms: Platform[] = [
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
    const d = coachTargetDisplay("https://gemini.google.com/app", platforms);
    expect(d.name).toBe("Gemini");
    expect(d.iconSlug).toBe("gemini");
  });

  it("names Mistral with favicon", () => {
    const d = coachTargetDisplay("https://chat.mistral.ai/");
    expect(d.name).toBe("Mistral");
    expect(d.faviconUrl).toMatch(/mistral/);
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
    });
    expect(plan.kind).toBe("switched");
    if (plan.kind === "switched") {
      expect(plan.model).toMatch(/mini|small|haiku|flash/i);
    }
  });

  it("redirects when no modelLabel", () => {
    const plan = planCoachAuto({
      draft: "what's the weather in Boston",
      model: "gpt-5",
      provider: "chatgpt",
    });
    expect(plan.kind).toBe("redirect");
    if (plan.kind === "redirect") {
      expect(plan.url).not.toMatch(/deepseek/i);
      expect(plan.target.name.length).toBeGreaterThan(0);
    }
  });
});

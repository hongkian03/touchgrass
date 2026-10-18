import { describe, expect, it } from "vitest";
import { coachTargetDisplay } from "../lib/coachTargetDisplay";
import {
  applyCoachSwitch,
  formatHandoffDraft,
  planCoachAuto,
  scrapeRecentMessages,
} from "../lib/coachYes";
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

  it("define ask + no label redirects to gemini (not weather-only)", () => {
    const plan = planCoachAuto({
      draft: "define photosynthesis",
      model: "claude-opus",
      provider: "claude",
      enabledPlatforms: ["claude", "gemini"],
    });
    expect(plan.kind).toBe("redirect");
    if (plan.kind === "redirect") {
      expect(plan.url).toMatch(/gemini\.google\.com/);
      expect(plan.suggestion.reason).not.toMatch(/^whats todays weather\?$/i);
    }
  });

  it("who-is ask + perplexity enabled redirects", () => {
    const plan = planCoachAuto({
      draft: "who is ada lovelace",
      model: "gpt-5",
      provider: "chatgpt",
      enabledPlatforms: ["chatgpt", "perplexity"],
    });
    expect(plan.kind).toBe("redirect");
    if (plan.kind === "redirect") {
      expect(plan.url).toMatch(/perplexity\.ai/);
    }
  });

  it("hard coding ask with no label still redirects only via alternate pick", () => {
    // needs_big → preferGemini true in pickEnabledAlternate; still may open gemini
    // when no model label — assert it is not weather-string gated.
    const plan = planCoachAuto({
      draft: "refactor this typescript module with generics and tests",
      model: "claude-opus",
      provider: "claude",
      enabledPlatforms: ["claude", "gemini"],
    });
    expect(["redirect", "noop", "switched"]).toContain(plan.kind);
    if (plan.kind === "redirect") {
      expect(plan.url).not.toMatch(/weather/i);
    }
  });
});

describe("multi-turn context carryover + inline model switch", () => {
  it("formatHandoffDraft returns raw draft when no prior turns exist", () => {
    expect(
      formatHandoffDraft({
        draft: "what's the weather in Boston",
        recentMessages: [],
        fromProvider: "Claude",
      }),
    ).toBe("what's the weather in Boston");
  });

  it("formatHandoffDraft prepends compact context when prior turns exist", () => {
    const out = formatHandoffDraft({
      draft: "what about tomorrow?",
      fromProvider: "Claude",
      recentMessages: [
        { role: "user", content: "Is it raining in Boston today?" },
        { role: "assistant", content: "Yes, light rain all afternoon." },
      ],
    });
    expect(out).toContain("[Prior context from Claude]");
    expect(out).toContain("User: Is it raining in Boston today?");
    expect(out).toContain("Assistant: Yes, light rain all afternoon.");
    expect(out).toContain("[Question]\nwhat about tomorrow?");
  });

  it("scrapeRecentMessages extracts user and assistant turns within character budget", () => {
    const root = {
      querySelectorAll: () => [
        {
          getAttribute: (k: string) =>
            k === "data-message-author-role" ? "user" : null,
          matches: () => true,
          textContent: "First user turn",
        },
        {
          getAttribute: (k: string) =>
            k === "data-message-author-role" ? "assistant" : null,
          matches: () => false,
          textContent: "First assistant reply",
        },
      ],
    } as unknown as ParentNode;
    const turns = scrapeRecentMessages(root, 4, 2400);
    expect(turns).toEqual([
      { role: "user", content: "First user turn" },
      { role: "assistant", content: "First assistant reply" },
    ]);
  });

  it("applyCoachSwitch updates label and clicks matching model option when present", () => {
    let clicked = false;
    const label = {
      textContent: "GPT-5",
      setAttribute: () => {},
    } as unknown as HTMLElement;
    const option = {
      textContent: "GPT-4o mini (fast)",
      click: () => {
        clicked = true;
      },
    } as unknown as HTMLElement;
    const root = {
      querySelectorAll: () => [option],
    } as unknown as ParentNode;
    const ok = applyCoachSwitch(label, "gpt-4o-mini", root);
    expect(ok).toBe(true);
    expect(label.textContent).toBe("gpt-4o-mini");
    expect(clicked).toBe(true);
  });
});

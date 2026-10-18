import { describe, expect, it } from "vitest";
import platformsData from "../data/platforms.json";
import {
  MAX_PREFILL_CHARS,
  prefillUrl,
  shouldOfferChoice,
  switchModelHere,
} from "../lib/coachChoice";
import type { Platform } from "../lib/types";

const platforms = platformsData as Platform[];
const chatgpt = platforms.find((p) => p.id === "chatgpt")!;
const dalle = platforms.find((p) => p.id === "dalle")!;

describe("shouldOfferChoice", () => {
  it("simple ask on the big default model → offer", () => {
    expect(
      shouldOfferChoice({ text: "what time is it", platform: chatgpt, currentModel: "gpt-5" }),
    ).toBe(true);
  });

  it("already on the small model → no offer", () => {
    expect(
      shouldOfferChoice({ text: "what time is it", platform: chatgpt, currentModel: "gpt-4o-mini" }),
    ).toBe(false);
  });

  it("real work → no offer", () => {
    expect(
      shouldOfferChoice({
        text: "debug this race condition in my queue",
        platform: chatgpt,
        currentModel: "gpt-5",
      }),
    ).toBe(false);
  });

  it("image platforms → no offer", () => {
    expect(
      shouldOfferChoice({ text: "a fox", platform: dalle, currentModel: "dall-e-3" }),
    ).toBe(false);
  });
});

describe("prefillUrl", () => {
  it("encodes the prompt for sites that read ?q=", () => {
    expect(prefillUrl("claude", "what time is it?")).toBe(
      "https://claude.ai/new?q=what%20time%20is%20it%3F",
    );
    expect(prefillUrl("chatgpt", "hi")).toBe("https://chatgpt.com/?q=hi");
    expect(prefillUrl("perplexity", "hi")).toBe(
      "https://www.perplexity.ai/search?q=hi",
    );
  });

  it("Gemini has no prefill → null (clipboard fallback)", () => {
    expect(prefillUrl("gemini", "hi")).toBeNull();
  });

  it("very long prompts fall back to the clipboard", () => {
    expect(prefillUrl("claude", "x".repeat(MAX_PREFILL_CHARS + 1))).toBeNull();
  });
});

/** Minimal stand-ins: the model button opens a menu of items. */
function fakePage(items: string[]) {
  const clicked: string[] = [];
  let open = false;
  const button = { click: () => { open = true; } } as unknown as HTMLElement;
  const root = {
    querySelectorAll: () =>
      open
        ? items.map((t) => ({ textContent: t, click: () => clicked.push(t) }))
        : [],
  } as unknown as ParentNode;
  return { button, root, clicked };
}

describe("switchModelHere", () => {
  it("opens the menu and picks the small model", async () => {
    const p = fakePage(["Thinking", "GPT-5 mini"]);
    expect(await switchModelHere(p.button, p.root, 0)).toBe("picked");
    expect(p.clicked).toEqual(["GPT-5 mini"]);
  });

  it("no small option → leaves the menu open", async () => {
    const p = fakePage(["Thinking", "Pro"]);
    expect(await switchModelHere(p.button, p.root, 0)).toBe("menu_open");
    expect(p.clicked).toEqual([]);
  });

  it("no model button → no_menu", async () => {
    expect(await switchModelHere(null)).toBe("no_menu");
  });
});

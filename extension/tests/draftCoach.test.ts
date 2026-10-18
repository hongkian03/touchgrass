import { describe, expect, it, vi } from "vitest";
import { DraftCoach, type CoachDraft } from "../lib/draftCoach";

function draft(partial: Partial<CoachDraft> = {}): CoachDraft {
  return {
    request_id: "11111111-1111-1111-1111-111111111111",
    draft_revision: 1,
    conversation_id: "c1",
    site: "chatgpt",
    current_model_label: "gpt-5",
    prompt_text: "hi",
    recent_messages: [],
    context_available: true,
    context_truncated: false,
    has_attachments: false,
    uses_tools: false,
    modality: "text",
    target_available: true,
    opted_in: true,
    ...partial,
  };
}

describe("DraftCoach holdSend", () => {
  it("returns suggestion within hold window", async () => {
    const classify = vi.fn(async () => ({
      request_id: "11111111-1111-1111-1111-111111111111",
      draft_revision: 1,
      conversation_id: "c1",
      site: "chatgpt",
      current_model_label: "gpt-5",
      action: "suggest_small",
      target: { model_id: "gpt-4o-mini", website_label: "GPT-4o mini" },
      ttl_ms: 30000,
      decision_id: "22222222-2222-2222-2222-222222222222",
      mode: "mock",
    }));
    const coach = new DraftCoach({ classify, holdMs: 800 });
    const ready = await coach.holdSend(draft());
    expect(ready?.action).toBe("suggest_small");
    expect(classify).toHaveBeenCalledOnce();
  });

  it("bypass skips hold once", async () => {
    const classify = vi.fn();
    const coach = new DraftCoach({ classify, holdMs: 800 });
    coach.armBypass();
    const ready = await coach.holdSend(draft());
    expect(ready).toBeNull();
    expect(classify).not.toHaveBeenCalled();
  });
});

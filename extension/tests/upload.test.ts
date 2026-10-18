import { describe, expect, it } from "vitest";
import { parseExport } from "../lib/upload";
import type { UsageRow } from "../lib/types";

const base: UsageRow[] = [
  {
    ts: "2026-10-16T12:00:00.000Z",
    provider: "chatgpt",
    model: "gpt-5",
    kind: "text",
    prompt_text: "seed",
    regenerated: false,
  },
];

/** P1 — one ChatGPT conversation, one user part "hello" */
const chatgptP1 = [
  {
    mapping: {
      a: {
        message: {
          author: { role: "user" },
          content: { parts: ["hello"] },
        },
      },
    },
  },
];

/** P2 — garbage */
const garbage = { foo: 1 };

/** P4 — Claude human message */
const claudeP4 = {
  chats: [
    {
      chat_messages: [
        { sender: "human", text: "bonjour", created_at: "2026-10-17T10:00:00Z" },
      ],
    },
  ],
};

describe("upload parser (issue #6 hand fixtures)", () => {
  it("P1 ChatGPT user part increases usage by 1", () => {
    const r = parseExport(JSON.stringify(chatgptP1), base);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.rows).toHaveLength(base.length + 1);
      expect(r.rows.at(-1)?.prompt_text).toBe("hello");
      expect(r.rows.at(-1)?.provider).toBe("chatgpt");
    }
  });

  it("P2 garbage leaves usage unchanged and returns error", () => {
    const r = parseExport(JSON.stringify(garbage), base);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Could not read that export/);
    expect(base).toHaveLength(1);
  });

  it("P3 empty file unchanged + error", () => {
    const r = parseExport("", base);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Could not read that export/);
  });

  it("P4 Claude human message adds one row", () => {
    const r = parseExport(JSON.stringify(claudeP4), base);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.rows).toHaveLength(base.length + 1);
      expect(r.rows.at(-1)?.prompt_text).toBe("bonjour");
      expect(r.rows.at(-1)?.provider).toBe("claude");
    }
  });
});

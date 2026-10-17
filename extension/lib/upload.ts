import type { UsageRow } from "./types";

export type ParseOk = { ok: true; rows: UsageRow[] };
export type ParseFail = { ok: false; error: string };
export type ParseResult = ParseOk | ParseFail;

const ERR = "Could not read that export.";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function chatgptParts(raw: unknown): string[] {
  const out: string[] = [];

  const walkConv = (conv: unknown) => {
    if (!isRecord(conv)) return;
    const mapping = conv.mapping;
    if (isRecord(mapping)) {
      for (const node of Object.values(mapping)) {
        if (!isRecord(node)) continue;
        const message = node.message;
        if (!isRecord(message)) continue;
        const author = message.author;
        if (!isRecord(author) || author.role !== "user") continue;
        const content = message.content;
        if (!isRecord(content)) continue;
        const parts = content.parts;
        if (!Array.isArray(parts)) continue;
        for (const p of parts) {
          if (typeof p === "string" && p.trim()) out.push(p.trim());
        }
      }
    }
  };

  if (Array.isArray(raw)) {
    for (const c of raw) walkConv(c);
    return out;
  }
  if (isRecord(raw) && Array.isArray(raw.conversations)) {
    for (const c of raw.conversations) walkConv(c);
    return out;
  }
  if (isRecord(raw) && isRecord(raw.mapping)) {
    walkConv(raw);
  }
  return out;
}

function claudeTexts(raw: unknown): string[] {
  const out: string[] = [];
  if (!isRecord(raw)) return out;
  const chats = Array.isArray(raw.chats) ? raw.chats : [raw];
  for (const chat of chats) {
    if (!isRecord(chat)) continue;
    const msgs = chat.chat_messages;
    if (!Array.isArray(msgs)) continue;
    for (const m of msgs) {
      if (!isRecord(m)) continue;
      if (m.sender !== "human") continue;
      const text =
        typeof m.text === "string"
          ? m.text
          : typeof m.content === "string"
            ? m.content
            : "";
      if (text.trim()) out.push(text.trim());
    }
  }
  return out;
}

function row(
  prompt: string,
  provider: string,
  model: string,
): UsageRow {
  return {
    ts: new Date().toISOString(),
    provider,
    model,
    kind: "text",
    prompt_text: prompt,
    regenerated: false,
  };
}

/** Local ChatGPT / Claude export → append rows. Never mutates `existing`. */
export function parseExport(
  text: string,
  existing: UsageRow[],
): ParseResult {
  if (!text.trim()) return { ok: false, error: ERR };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: ERR };
  }

  const gpt = chatgptParts(raw);
  if (gpt.length > 0) {
    return {
      ok: true,
      rows: [
        ...existing,
        ...gpt.map((p) => row(p, "chatgpt", "gpt-5")),
      ],
    };
  }

  const claude = claudeTexts(raw);
  if (claude.length > 0) {
    return {
      ok: true,
      rows: [
        ...existing,
        ...claude.map((p) => row(p, "claude", "claude-opus")),
      ],
    };
  }

  return { ok: false, error: ERR };
}

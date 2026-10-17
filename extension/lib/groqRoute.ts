import platformsData from "../data/platforms.json";
import type { Platform } from "./types";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "qwen/qwen3.8-27b";

const platforms = platformsData as Platform[];

export type GroqRouteResult =
  | { ok: true; platformId: string; reason: string }
  | { ok: false; error: string };

const ROUTE_SYSTEM = `You route a user's AI chat draft to the best platform from a fixed allowlist.
Reply with ONLY compact JSON: {"platformId":string,"reason":string}
Rules:
- platformId MUST be one of the provided enabled ids. Never invent an id.
- Never pick deepseek (not a green route).
- Image / draw / video / generate picture → dalle, midjourney, or flux if enabled; else best text chat.
- Research, news, weather, "what's happening", current events → perplexity if enabled, else gemini, else any text chat.
- Code, long reasoning, hard analysis → claude or chatgpt if enabled.
- Short factoid / simple Q → gemini or chatgpt if enabled.
- If the current site is already the best fit, return the current provider id (no hop).
- reason = short phrase, max 8 words.`;

/** Validate / normalize Groq JSON against enabled list. Exported for tests. */
export function parseRouteQueryResponse(
  raw: string,
  enabledPlatforms: string[],
  currentProvider: string,
): GroqRouteResult {
  const allowed = new Set(
    enabledPlatforms.filter((id) => id && id !== "deepseek" && !/deepseek/i.test(id)),
  );
  if (allowed.size === 0) {
    return { ok: false, error: "no_enabled" };
  }

  let parsed: { platformId?: string; reason?: string };
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { ok: false, error: "bad_json" };
    parsed = JSON.parse(jsonMatch[0]) as {
      platformId?: string;
      reason?: string;
    };
  } catch {
    return { ok: false, error: "bad_json" };
  }

  let id = typeof parsed.platformId === "string" ? parsed.platformId.trim() : "";
  if (/deepseek/i.test(id)) {
    return { ok: false, error: "refuse_deepseek" };
  }
  if (!allowed.has(id)) {
    // Fall back to current if still allowed, else first allowed
    if (allowed.has(currentProvider)) {
      id = currentProvider;
    } else {
      id = [...allowed][0]!;
    }
  }

  const reason =
    typeof parsed.reason === "string" && parsed.reason.trim()
      ? parsed.reason.trim().slice(0, 80)
      : "Best fit for this ask";

  return { ok: true, platformId: id, reason };
}

export async function groqRouteQuery(args: {
  draft: string;
  currentProvider: string;
  enabledPlatforms: string[];
  platformCatalog?: Platform[];
}): Promise<GroqRouteResult> {
  const key = import.meta.env.WXT_GROQ_API_KEY as string | undefined;
  if (!key) {
    return { ok: false, error: "missing_key" };
  }

  const draft = args.draft.trim();
  if (!draft) return { ok: false, error: "empty_draft" };

  const catalog = args.platformCatalog ?? platforms;
  const enabled = args.enabledPlatforms.filter(
    (id) => id && id !== "deepseek" && !/deepseek/i.test(id),
  );
  if (enabled.length === 0) return { ok: false, error: "no_enabled" };

  const choices = enabled.map((id) => {
    const p = catalog.find((x) => x.id === id);
    const name = p?.name ?? id;
    const kind = p?.kind ?? "text";
    return `${id} (${name}, ${kind})`;
  });

  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0,
        max_tokens: 100,
        messages: [
          { role: "system", content: ROUTE_SYSTEM },
          {
            role: "user",
            content: [
              `Current site: ${args.currentProvider}`,
              `Enabled platforms: ${choices.join("; ")}`,
              `Draft: ${draft.slice(0, 500)}`,
            ].join("\n"),
          },
        ],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return {
        ok: false,
        error: `http_${res.status}:${text.slice(0, 120)}`,
      };
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content?.trim() ?? "";
    return parseRouteQueryResponse(content, enabled, args.currentProvider);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "fetch_failed",
    };
  }
}

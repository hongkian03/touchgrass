/**
 * Ask Groq whether a hostname is an AI product / chat / image / codegen site.
 * Key from import.meta.env.WXT_GROQ_API_KEY
 */
export type AiSiteVerdict = {
  isAi: boolean;
  label?: string;
  error?: string;
};

/** @deprecated use AiSiteVerdict */
export type GrokAiVerdict = AiSiteVerdict;

const SYSTEM = `You classify websites for an AI-usage Chrome extension.
Reply with ONLY compact JSON: {"isAi":boolean,"label":string}
isAi=true ONLY if the site is primarily an AI chat, AI image/video gen, AI coding agent, or AI model playground people use as a product.
isAi=false for social media, video hosts (YouTube), shopping, news, banks, generic SaaS without AI as the main product.
label = short display name if isAi, else "".`;

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "qwen/qwen3.8-27b";

export async function groqIsAiSite(hostname: string): Promise<AiSiteVerdict> {
  const key = import.meta.env.WXT_GROQ_API_KEY as string | undefined;
  if (!key) {
    return { isAi: false, error: "missing_key" };
  }

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
        max_tokens: 80,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `Hostname: ${hostname}` },
        ],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return { isAi: false, error: `http_${res.status}:${text.slice(0, 120)}` };
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content?.trim() ?? "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { isAi: false, error: "bad_json" };
    const parsed = JSON.parse(jsonMatch[0]) as {
      isAi?: boolean;
      label?: string;
    };
    return {
      isAi: Boolean(parsed.isAi),
      label: typeof parsed.label === "string" ? parsed.label : undefined,
    };
  } catch (e) {
    return {
      isAi: false,
      error: e instanceof Error ? e.message : "fetch_failed",
    };
  }
}

/** Back-compat alias while callers migrate. */
export const grokIsAiSite = groqIsAiSite;

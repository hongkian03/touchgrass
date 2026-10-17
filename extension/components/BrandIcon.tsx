import { useId } from "react";
import { svg as chatgpt } from "@thesvg/icons/openai-chatgpt";
import { svg as claude } from "@thesvg/icons/claude-ai";
import { svg as dalle } from "@thesvg/icons/dall-e-openai";
import { svg as deepseek } from "@thesvg/icons/deepseek";
import { svg as flux } from "@thesvg/icons/flux";
import { svg as grok } from "@thesvg/icons/grok-xai";
import {
  svg as midjourneyDefault,
  variants as midjourneyVariants,
} from "@thesvg/icons/midjourney";
import { svg as perplexity } from "@thesvg/icons/perplexity-ai";

const midjourneyRaw = midjourneyVariants.light ?? midjourneyDefault;

/** Exact Gemini SVG lives at /icons/gemini.svg — loaded as <img>, zero edits. */
const GEMINI_SRC = "/icons/gemini.svg";

const ICONS: Record<string, string | "gemini-img"> = {
  "openai-chatgpt": chatgpt,
  "claude-ai": claude,
  gemini: "gemini-img",
  "gemini-google": "gemini-img",
  "google-gemini": "gemini-img",
  "perplexity-ai": perplexity,
  "grok-xai": grok,
  deepseek,
  "dall-e-openai": dalle,
  midjourney: midjourneyRaw,
  flux,
};

type Props = {
  slug: string;
  size?: number;
  label?: string;
};

function prepareMarkup(raw: string, uid: string, slug: string): string {
  let markup = raw
    .replace(/\bid="([^"]+)"/g, `id="${uid}-$1"`)
    .replace(/url\(#([^)]+)\)/g, `url(#${uid}-$1)`);

  markup = markup
    .replace(/fill="#fff(?:fff)?"/gi, 'fill="currentColor"')
    .replace(/fill="white"/gi, 'fill="currentColor"')
    .replace(/stroke="#fff(?:fff)?"/gi, 'stroke="currentColor"')
    .replace(/stroke="white"/gi, 'stroke="currentColor"');

  if (slug === "midjourney") {
    markup = markup
      .replace(/stroke="black"/gi, 'stroke="currentColor"')
      .replace(/stroke-width="18"/g, 'stroke-width="42"');
  }

  return markup;
}

export function BrandIcon({ slug, size = 28, label }: Props) {
  const uid = useId().replace(/:/g, "");
  const entry = ICONS[slug];
  if (!entry) {
    return (
      <span
        aria-hidden
        className="flex items-center justify-center rounded-full text-xs font-semibold"
        style={{
          width: size,
          height: size,
          background: "var(--muted)",
          color: "var(--foreground)",
        }}
      >
        {(label ?? slug).slice(0, 2)}
      </span>
    );
  }

  if (entry === "gemini-img") {
    return (
      <img
        src={GEMINI_SRC}
        alt={label ?? "Gemini"}
        width={size}
        height={size}
        data-testid="icon-gemini"
        style={{ width: size, height: size, display: "block", objectFit: "contain" }}
      />
    );
  }

  return (
    <span
      role="img"
      aria-label={label ?? slug}
      className="inline-flex shrink-0 items-center justify-center overflow-hidden"
      style={{ width: size, height: size, color: "var(--foreground)" }}
      dangerouslySetInnerHTML={{ __html: prepareMarkup(entry, uid, slug) }}
    />
  );
}

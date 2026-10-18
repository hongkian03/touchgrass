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
const PERPLEXITY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="50 32 300 336" fill="none"><path fill="#20808d" fill-rule="evenodd" clip-rule="evenodd" d="m101.008 42 89.982 82.905V42.191h17.516v83.085L298.891 42v94.524H336v136.342h-36.995v84.169l-90.499-79.51v80.423H190.99v-79.112L101.11 358v-85.134H64V136.524h37.008V42Zm76.777 111.826h-96.27v101.738h19.573v-32.092l76.697-69.646Zm-59.16 77.323v88.243l72.365-63.737v-90.234l-72.365 65.728Zm90.385 23.663v-89.476l72.386 65.732v41.798h.093v45.625l-72.479-63.679Zm89.995.752h19.479V153.826h-95.552l76.073 68.925v32.813Zm-17.63-119.04V81.798l-59.398 54.726h59.398Zm-103.454 0h-59.397V81.798l59.397 54.726Z"/></svg>`;

const midjourneyRaw = midjourneyVariants.light ?? midjourneyDefault;

/** Exact Gemini SVG at public/icons/gemini.svg — same file onboarding uses. */
function geminiSrc(): string {
  try {
    if (typeof browser !== "undefined" && browser.runtime?.getURL) {
      return browser.runtime.getURL("/icons/gemini.svg");
    }
  } catch {
    /* page context without extension */
  }
  return "/icons/gemini.svg";
}

const ICONS: Record<string, string | "gemini-img"> = {
  "openai-chatgpt": chatgpt,
  "claude-ai": claude,
  gemini: "gemini-img",
  "gemini-google": "gemini-img",
  "google-gemini": "gemini-img",
  "perplexity-ai": PERPLEXITY_SVG,
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
  role?: "img" | "presentation";
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

  markup = markup.replace(/<svg\b([^>]*)>/i, (_full, attrs: string) => {
    const cleaned = attrs
      .replace(/\s*\bwidth="[^"]*"/gi, "")
      .replace(/\s*\bheight="[^"]*"/gi, "");
    return `<svg${cleaned} width="100%" height="100%" style="display:block;width:100%;height:100%">`;
  });

  return markup;
}

export function BrandIcon({ slug, size = 28, label, role = "img" }: Props) {
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
        src={geminiSrc()}
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
      role={role}
      aria-label={role === "img" ? (label ?? slug) : undefined}
      aria-hidden={role !== "img" ? true : undefined}
      data-brand-icon={slug}
      className="inline-flex shrink-0 items-center justify-center overflow-hidden"
      style={{
        width: size,
        height: size,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        overflow: "hidden",
        color: "var(--foreground, #1b4965)",
      }}
      dangerouslySetInnerHTML={{ __html: prepareMarkup(entry, uid, slug) }}
    />
  );
}

/**
 * Per-prompt footprint ESTIMATES. Every number here is an estimate, not metering:
 * the extension can't see the provider's servers, so each sent prompt is charged a
 * published average for its platform. Each value names where it came from.
 */
import type { FootprintModel } from "./totals";

const ML_PER_L = 1000;

/**
 * Google, "Measuring the environmental impact of delivering AI at Google scale"
 * (technical paper, Aug 2025): median Gemini Apps text prompt.
 * 0.24 Wh energy, 0.26 mL water, 0.03 gCO2e (market-based emissions).
 */
export const GOOGLE_GEMINI_MEDIAN = { Wh: 0.24, water_mL: 0.26, co2_g: 0.03 };

/**
 * Sam Altman, "The Gentle Singularity" (blog, June 10 2025): average ChatGPT query
 * ≈ 0.34 Wh and ≈ 0.000085 gallons of water (≈ 0.32 mL).
 * OpenAI gives no CO2 figure, so co2_g is DERIVED: 0.34 Wh × Google's ratio
 * (0.03 g / 0.24 Wh = 0.125 gCO2e/Wh). Same accounting basis as the Gemini figure.
 */
export const GOOGLE_CO2_PER_WH =
  GOOGLE_GEMINI_MEDIAN.co2_g / GOOGLE_GEMINI_MEDIAN.Wh;
export const OPENAI_CHATGPT_AVG = {
  Wh: 0.34,
  water_mL: 0.32,
  co2_g: 0.34 * GOOGLE_CO2_PER_WH,
};

/**
 * ESTIMATE, no published figure: Anthropic (and xAI, Perplexity, DeepSeek) haven't
 * published per-prompt numbers. We use the midpoint of the Google and OpenAI figures
 * and show the range (0.24–0.34 Wh) wherever it's explained.
 */
export const UNPUBLISHED_RANGE = {
  low: GOOGLE_GEMINI_MEDIAN,
  high: OPENAI_CHATGPT_AVG,
};
export const UNPUBLISHED_MIDPOINT = {
  Wh: (GOOGLE_GEMINI_MEDIAN.Wh + OPENAI_CHATGPT_AVG.Wh) / 2,
  water_mL: (GOOGLE_GEMINI_MEDIAN.water_mL + OPENAI_CHATGPT_AVG.water_mL) / 2,
  co2_g: (GOOGLE_GEMINI_MEDIAN.co2_g + OPENAI_CHATGPT_AVG.co2_g) / 2,
};

/**
 * ASSUMPTION, not published: a small model (mini, Haiku, Flash, …) costs 25% of its
 * site's big default per prompt. No provider publishes per-model figures.
 */
export const SMALL_MODEL_FRACTION = 0.25;

/**
 * ASSUMPTION, not published: one generated image ≈ 10 text prompts. Same order of
 * magnitude as Luccioni et al. 2023 ("Power Hungry Processing", ~2.9 kWh per 1,000
 * image generations ≈ 2.9 Wh each), but the multiplier itself is our choice.
 */
export const IMAGE_MULTIPLIER = 10;

/**
 * ASSUMPTION, not published: one generated video ≈ 1,000 text prompts. Deliberately
 * below MIT Technology Review's May 2025 estimate (~3.4 MJ ≈ 944 Wh for a 5 s clip).
 */
export const VIDEO_MULTIPLIER = 1000;

type PerPrompt = { Wh: number; water_mL: number; co2_g: number };

function model(base: PerPrompt, factor = 1): FootprintModel {
  return {
    Wh: base.Wh * factor,
    water_L: (base.water_mL * factor) / ML_PER_L,
    co2_g: base.co2_g * factor,
  };
}

/** Keys match platforms.json defaultModel / smallModel. */
export const FOOTPRINT_MODELS: Record<string, FootprintModel> = {
  // ChatGPT: OpenAI average query (published)
  "gpt-5": model(OPENAI_CHATGPT_AVG),
  "gpt-4o-mini": model(OPENAI_CHATGPT_AVG, SMALL_MODEL_FRACTION),
  // Gemini: Google median prompt (published)
  "gemini-pro": model(GOOGLE_GEMINI_MEDIAN),
  "gemini-flash": model(GOOGLE_GEMINI_MEDIAN, SMALL_MODEL_FRACTION),
  // Claude and the rest: unpublished → midpoint estimate
  "claude-opus": model(UNPUBLISHED_MIDPOINT),
  "claude-haiku": model(UNPUBLISHED_MIDPOINT, SMALL_MODEL_FRACTION),
  "grok-3": model(UNPUBLISHED_MIDPOINT),
  "grok-mini": model(UNPUBLISHED_MIDPOINT, SMALL_MODEL_FRACTION),
  "sonar-pro": model(UNPUBLISHED_MIDPOINT),
  sonar: model(UNPUBLISHED_MIDPOINT, SMALL_MODEL_FRACTION),
  "deepseek-chat": model(UNPUBLISHED_MIDPOINT),
  // Images and video: assumed multipliers on a text prompt
  "dall-e-3": model(OPENAI_CHATGPT_AVG, IMAGE_MULTIPLIER),
  "midjourney-v6": model(UNPUBLISHED_MIDPOINT, IMAGE_MULTIPLIER),
  "flux-pro": model(UNPUBLISHED_MIDPOINT, IMAGE_MULTIPLIER),
  "flux-schnell": model(
    UNPUBLISHED_MIDPOINT,
    IMAGE_MULTIPLIER * SMALL_MODEL_FRACTION,
  ),
  "video-gen": model(UNPUBLISHED_MIDPOINT, VIDEO_MULTIPLIER),
};

/** One line for UI hints and the passport. */
export const FOOTPRINT_SOURCE_NOTE =
  "Estimates: Google Gemini median prompt (Aug 2025), OpenAI ChatGPT average (Jun 2025); other AIs use the midpoint. Small models, images and video use assumed multipliers.";

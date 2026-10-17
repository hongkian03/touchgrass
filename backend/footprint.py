"""Footprint model: the only place energy, water, and CO2 numbers come from.

############################################################################################
#  PLACEHOLDER RANGES. Every number below is a made-up stand-in so the Analyst can be built  #
#  and tested. None of them is a real estimate. Person D replaces this module with the real #
#  model; keep these four function signatures so nothing else has to change.               #
############################################################################################

Droid's analysis imports this module and never edits it; the Analyst job checks its SHA-256
before and after every run.

Interface (agreed in milestones/factory.md, F4):
  energy_wh(kind, model, output_tokens)          -> (low, high) Wh
  water_ml(wh)                                   -> mL
  co2_g(wh, region=None)                         -> gCO2e
  compare_models(model_a, model_b, output_tokens) -> (low, high) percent saved by using model_b
"""

PLACEHOLDER = True

# PLACEHOLDER: Wh per 1,000 output tokens, (low, high), by model size class.
TEXT_WH_PER_1K_TOKENS = {
    "small": (0.05, 0.2),
    "medium": (0.3, 1.2),
    "large": (1.5, 6.0),
}
# PLACEHOLDER: Wh per generated image and per generated video, (low, high).
IMAGE_WH = (2.0, 8.0)
VIDEO_WH = (60.0, 240.0)
# PLACEHOLDER: mL of water per Wh (cooling plus electricity generation).
WATER_ML_PER_WH = 2.0
# PLACEHOLDER: grams CO2e per Wh by grid region; "default" when the region is unknown.
CO2_G_PER_WH = {"default": 0.4, "us-east": 0.38, "us-west": 0.25, "eu-north": 0.05}

# Substrings that put a model in a size class. Checked in order; anything else is "medium".
_SMALL = ("mini", "nano", "flash", "haiku", "small", "lite")
_LARGE = ("o1", "o3", "opus", "pro", "ultra", "large")


def model_class(model):
    name = (model or "").lower()
    if any(s in name for s in _SMALL):
        return "small"
    if any(s in name for s in _LARGE):
        return "large"
    return "medium"


def energy_wh(kind, model, output_tokens):
    """Energy for one exchange as (low, high) Wh. kind is "text", "image" or "video"."""
    if kind == "image":
        return IMAGE_WH
    if kind == "video":
        return VIDEO_WH
    low, high = TEXT_WH_PER_1K_TOKENS[model_class(model)]
    k = max(output_tokens, 0) / 1000
    return (low * k, high * k)


def water_ml(wh):
    """Water for wh watt-hours, in mL."""
    return wh * WATER_ML_PER_WH


def co2_g(wh, region=None):
    """Emissions for wh watt-hours, in grams CO2e."""
    return wh * CO2_G_PER_WH.get(region or "default", CO2_G_PER_WH["default"])


def compare_models(model_a, model_b, output_tokens):
    """Percent of energy saved by using model_b instead of model_a for the same output, (low, high)."""
    a_low, a_high = energy_wh("text", model_a, output_tokens)
    b_low, b_high = energy_wh("text", model_b, output_tokens)
    if a_low <= 0 or a_high <= 0:
        return (0.0, 0.0)
    # Low compares the low ends, high the high ends; both are clipped at 0 (no negative savings).
    return (max(0.0, 100 * (1 - b_low / a_low)), max(0.0, 100 * (1 - b_high / a_high)))

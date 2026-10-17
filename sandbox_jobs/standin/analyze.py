"""Stand-in for Droid Job 2: write a dummy insights.json from prompts.jsonl.

Uses counts only, never prompt or response text, since insights.json leaves the sandbox.

Usage: python analyze.py PROMPTS_JSONL OUT_JSON
"""

import json
import sys
from collections import Counter


def main(prompts_path, out_path):
    with open(prompts_path, encoding="utf-8") as f:
        rows = [json.loads(line) for line in f if line.strip()]
    models = Counter(r["model"] or "(unknown)" for r in rows)
    regenerated = sum(r["regenerated"] for r in rows)
    images = sum(r["kind"] == "image" for r in rows)
    top_model, top_count = models.most_common(1)[0] if models else ("(none)", 0)

    insights = {
        "standin": True,
        "stats": {"exchanges": len(rows), "models": dict(models), "regenerated": regenerated, "images": images},
        "tips": [
            {"title": f"{regenerated} regenerated answer(s)",
             "detail": "A clearer first prompt often saves a regeneration."},
            {"title": f"{images} image generation(s)",
             "detail": "Image requests cost far more than text; batch ideas into one request."},
            {"title": f"Most used model: {top_model} ({top_count} of {len(rows)})",
             "detail": "Try a smaller model for quick questions."},
        ],
    }
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(insights, f, indent=2)
    return insights


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
    print("wrote insights")

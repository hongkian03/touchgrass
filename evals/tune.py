"""Sweep cached development predictions; never issue inference calls."""

import argparse
import json
from pathlib import Path

from backend.coaching.config import Settings
from backend.coaching.profiles import Policy
from backend.coaching.rubric import fingerprint
from backend.coaching.schemas import Decision

from .data import write_json


def tune(records, profile, source_mode, revision, target=0.02, min_support=20):
    if not 0 <= target <= 1 or min_support < 1:
        raise ValueError("invalid selection constraints")
    if not records or any(r["split"] != "dev" for r in records):
        raise ValueError("only development rows may select a threshold")
    thresholds = {1.0}
    parsed = []
    for r in records:
        try:
            d = Decision.model_validate(r["output"])
        except (ValueError, TypeError):
            continue
        if d.prediction is not None:
            thresholds.add(d.prediction.probabilities["small_ok"])
            parsed.append((r, d))
    candidates = []
    for threshold in sorted(thresholds):
        all_suggestions = [
            r
            for r, d in parsed
            if d.prediction.label == "small_ok"
            and d.prediction.probabilities["small_ok"] >= threshold
        ]
        suggested = [
            r for r in all_suggestions if r["reference"]["small_adequate"] is not None
        ]
        harmful = sum(r["reference"]["small_adequate"] is False for r in suggested)
        if len(suggested) >= min_support and harmful / len(suggested) <= target:
            candidates.append((len(all_suggestions), threshold, harmful))
    best = max(candidates, key=lambda c: (c[0], c[1])) if candidates else None
    version = (
        "tuned-"
        + fingerprint(
            {
                "revision": revision,
                "target": target,
                "min_support": min_support,
                "best": best,
            }
        )[:12]
    )
    return Policy(
        version=version,
        status="provisional" if best else "shadow",
        profile_fingerprint=profile.fingerprint,
        threshold=best[1] if best else 1.0,
        tuning_revision=revision,
        source_mode=source_mode,
    )


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--rows", required=True)
    p.add_argument("--output", required=True)
    p.add_argument("--target", type=float, default=0.02)
    p.add_argument("--min-support", type=int, default=20)
    args = p.parse_args()
    data = json.loads(Path(args.rows).read_text())
    settings = Settings.from_env()
    profile, _ = settings.artifacts()
    if (
        data["manifest"]["profile"] != profile.fingerprint
        or data["manifest"]["mode"] != settings.mode
    ):
        p.error("cached run differs from configured profile/mode")
    policy = tune(
        data["records"],
        profile,
        settings.mode,
        data["manifest"]["dataset_revision"],
        args.target,
        args.min_support,
    )
    write_json(args.output, policy.model_dump())
    print(
        json.dumps(
            {
                "status": policy.status,
                "threshold": policy.threshold,
                "version": policy.version,
            }
        )
    )


if __name__ == "__main__":
    main()

"""Inspect a profile fingerprint or create explicitly synthetic demo artifacts."""

import argparse
import os
from pathlib import Path

from backend.coaching.profiles import CoachingProfile, Generation, Policy, mock_profile
from evals.data import Reference, load_dataset, write_dataset, write_json


def live_eval(directory, resolved_jev):
    """Prepare offline-only live configuration; never call or deploy a model."""
    names = ("JEV_MODEL_ID", "SMALL_MODEL_ID", "LARGE_MODEL_ID", "JUDGE_MODEL_ID")
    models = {name: os.getenv(name, "").strip() for name in names}
    if any(not model for model in models.values()):
        raise ValueError("all four model ID variables must be set")
    if models["SMALL_MODEL_ID"] == models["LARGE_MODEL_ID"]:
        raise ValueError("benchmark answer models must differ")
    if models["JUDGE_MODEL_ID"] in [models[name] for name in names[:3]]:
        raise ValueError("the generative judge must be a separate model")
    directory = Path(directory)
    if any(
        (directory / name).exists()
        for name in ("profile.json", "policy.json", "tasks.jsonl")
    ):
        raise ValueError("artifacts already exist; choose a new directory")
    profile = CoachingProfile(
        profile_id="offline-text-benchmark",
        version="offline-text-v1",
        validity="provisional",
        site="offline-benchmark",
        small_model_id=models["SMALL_MODEL_ID"],
        large_model_id=models["LARGE_MODEL_ID"],
        jev_model_id=models["JEV_MODEL_ID"],
        expected_jev_resolved_model=resolved_jev,
        website_aliases=[],
        website_target_label="",
        switch_supported=False,
        website_equivalence_verified=False,
        small_capabilities=(
            "Candidate: " + models["SMALL_MODEL_ID"] + ". "
            "Text-only answers without external tools. Initial hypothesis: short rewriting, "
            "extraction, basic arithmetic and straightforward explanations may be adequate. "
            "These capabilities have not yet been measured on this project's tasks. "
            "Do not treat the hypothesis as evaluated evidence; choose uncertain when "
            "the task requires unsupported capability assumptions."
        ),
        small_generation=Generation(max_tokens=2048, temperature=None),
        large_generation=Generation(max_tokens=2048, temperature=None),
        judge_generation=Generation(
            max_tokens=4096,
            token_limit_parameter="max_completion_tokens",
            temperature=None,
        ),
    )
    policy = Policy(
        version="offline-shadow-v1",
        source_mode="live",
        profile_fingerprint=profile.fingerprint,
    )
    rows = load_dataset("evals/datasets/smoke.jsonl")
    for row in rows:
        row.request.mock_fixture_id = None
        row.request.site = profile.site
        row.request.current_model_label = "offline-baseline"
        row.request.target_available = False
        row.reference = Reference()
    write_json(directory / "profile.json", profile.model_dump())
    write_json(directory / "policy.json", policy.model_dump())
    write_dataset(directory / "tasks.jsonl", rows)
    print("Created live shadow artifacts and synthetic tasks in " + str(directory))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    demo = sub.add_parser(
        "mock", help="Write mock profile and provisional policy for UI tests only"
    )
    demo.add_argument("--directory", default="artifacts/mock-config")
    live = sub.add_parser(
        "live-eval",
        help="Create an offline benchmark profile, shadow policy and synthetic tasks",
    )
    live.add_argument("--directory", default="artifacts/live-eval-v1")
    live.add_argument(
        "--resolved-jev",
        required=True,
        help="Resolved Jev identity from a successful request",
    )
    inspect = sub.add_parser(
        "fingerprint", help="Print the canonical fingerprint for a reviewed profile"
    )
    inspect.add_argument("--profile", required=True)
    args = parser.parse_args()
    if args.command == "live-eval":
        live_eval(args.directory, args.resolved_jev)
    elif args.command == "fingerprint":
        print(
            CoachingProfile.model_validate_json(
                Path(args.profile).read_text()
            ).fingerprint
        )
    else:
        profile = mock_profile()
        policy = Policy(
            version="mock-demo-v1",
            status="provisional",
            threshold=0.9,
            profile_fingerprint=profile.fingerprint,
        )
        write_json(Path(args.directory) / "profile.json", profile.model_dump())
        write_json(Path(args.directory) / "policy.json", policy.model_dump())
        print("Wrote synthetic mock artifacts; threshold is unvalidated.")


if __name__ == "__main__":
    main()

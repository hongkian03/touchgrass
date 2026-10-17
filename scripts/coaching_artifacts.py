"""Inspect a profile fingerprint or create explicitly synthetic demo artifacts."""

import argparse
from pathlib import Path

from backend.coaching.profiles import CoachingProfile, Policy, mock_profile
from evals.data import write_json


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    demo = sub.add_parser(
        "mock", help="Write mock profile and provisional policy for UI tests only"
    )
    demo.add_argument("--directory", default="artifacts/mock-config")
    inspect = sub.add_parser(
        "fingerprint", help="Print the canonical fingerprint for a reviewed profile"
    )
    inspect.add_argument("--profile", required=True)
    args = parser.parse_args()
    if args.command == "fingerprint":
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

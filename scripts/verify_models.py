"""Make one billed smoke request per role and save sanitized results."""

import argparse
import asyncio

from backend.coaching.config import Settings
from backend.integrations.chalk_gateway import GatewayError
from evals.data import write_json
from scripts.chalk_doctor import inspect


async def verify(settings, output):
    if settings.mode != "live":
        raise ValueError("verification requires live configuration")
    profile, _ = settings.artifacts()
    models = {
        "jev": profile.jev_model_id,
        "small": profile.small_model_id,
        "large": profile.large_model_id,
        "judge": settings.judge_model_id,
    }
    if not all(models.values()):
        raise ValueError("all model roles must be configured")
    report = {
        "status": "running",
        "profile_fingerprint": profile.fingerprint,
        "roles": {},
    }
    write_json(output, report)
    for role, model in models.items():
        try:
            result = await inspect(
                argparse.Namespace(network=False, smoke=role), settings
            )
            report["roles"][role] = {
                "status": "passed",
                "requested_model": model,
                "result": result,
            }
        except Exception as exc:
            report["roles"][role] = {
                "status": "failed",
                "requested_model": model,
                "error_type": type(exc).__name__,
                "category": (
                    exc.category
                    if isinstance(exc, GatewayError)
                    else "configuration_or_transport_error"
                ),
            }
        write_json(output, report)
        print(role + ": " + report["roles"][role]["status"])
    passed = all(r["status"] == "passed" for r in report["roles"].values())
    report["status"] = "passed" if passed else "failed"
    write_json(output, report)
    return passed


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--execute",
        action="store_true",
        required=True,
        help="Authorize four billed inference calls",
    )
    parser.add_argument(
        "--output", default="artifacts/live-eval-v1/model-verification.json"
    )
    args = parser.parse_args()
    try:
        passed = asyncio.run(verify(Settings.from_env(), args.output))
    except Exception as exc:
        print("Verification could not start: " + type(exc).__name__)
        raise SystemExit(1) from None
    print("Results: " + args.output)
    raise SystemExit(0 if passed else 1)


if __name__ == "__main__":
    main()

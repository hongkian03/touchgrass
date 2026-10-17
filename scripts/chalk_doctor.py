"""Offline configuration inspection; network and billed smoke calls are explicit."""

import argparse
import asyncio
import json

import httpx

from backend.coaching.config import Settings
from backend.integrations.chalk_gateway import Gateway, GatewayError
from evals.data import load_dataset


async def inspect(args, settings):
    profile, policy = settings.artifacts()
    if profile.fingerprint != policy.profile_fingerprint:
        raise ValueError("profile/policy fingerprint mismatch")
    result = {
        "mode": settings.mode,
        "coaching_mode": settings.coaching_mode,
        "profile_fingerprint": profile.fingerprint,
        "policy_version": policy.version,
        "policy_matches": policy.profile_fingerprint == profile.fingerprint,
        "website_equivalence_verified": profile.website_equivalence_verified,
        "savings_available": False,
        "network_checked": False,
        "inference_checked": False,
    }
    if args.network or args.smoke:
        if settings.mode != "live":
            raise ValueError(
                "network/smoke commands require explicit live configuration"
            )
        async with httpx.AsyncClient(follow_redirects=False, trust_env=False) as client:
            gateway = Gateway(client, settings)
            if args.network:
                catalog = await gateway.request("GET", "/models")
                available = {
                    m["id"]
                    for m in catalog.get("data", [])
                    if isinstance(m, dict) and isinstance(m.get("id"), str)
                }
                result["model_availability"] = {
                    model: model in available
                    for model in [
                        profile.jev_model_id,
                        profile.small_model_id,
                        profile.large_model_id,
                        settings.judge_model_id,
                    ]
                    if model
                }
                result["network_checked"] = True
            if args.smoke == "jev":
                row = load_dataset("evals/datasets/smoke.jsonl")[0]
                request = row.request.model_copy(
                    update={
                        "current_model_label": (
                            profile.website_aliases[0]
                            if profile.website_aliases
                            else "offline-baseline"
                        ),
                        "mock_fixture_id": None,
                        "site": profile.site,
                    }
                )
                prediction = await gateway.predict(request, profile)
                if (
                    profile.expected_jev_resolved_model
                    and prediction.resolved_model != profile.expected_jev_resolved_model
                ):
                    raise GatewayError("model_version_mismatch")
                result["prediction"] = prediction.model_dump()
                result["inference_checked"] = True
            elif args.smoke:
                model = {
                    "small": profile.small_model_id,
                    "large": profile.large_model_id,
                    "judge": settings.judge_model_id,
                }[args.smoke]
                if not model:
                    raise ValueError("requested model is not configured")
                answer = await gateway.chat(
                    model,
                    [{"role": "user", "content": "Reply with the word ready."}],
                    (
                        profile.judge_generation
                        if args.smoke == "judge"
                        else getattr(profile, args.smoke + "_generation")
                    ),
                )
                result["answer_status"] = {
                    "valid": answer.valid,
                    "resolved_model": answer.resolved_model,
                    "usage": answer.usage,
                }
                if not answer.valid:
                    raise GatewayError("invalid_answer")
                result["inference_checked"] = True
    return result


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--network",
        action="store_true",
        help="Opt into listing gateway models without inference",
    )
    p.add_argument(
        "--smoke",
        choices=["jev", "small", "large", "judge"],
        help="Authorize one billed synthetic model request",
    )
    args = p.parse_args()
    try:
        result = asyncio.run(inspect(args, Settings.from_env()))
    except Exception as exc:
        # Configuration errors may embed secret input values: print only safe type.
        print(
            json.dumps(
                {
                    "status": "configuration_or_gateway_error",
                    "error_type": type(exc).__name__,
                    "category": (
                        exc.category
                        if isinstance(exc, GatewayError)
                        else "configuration_error"
                    ),
                }
            )
        )
        raise SystemExit(1)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()

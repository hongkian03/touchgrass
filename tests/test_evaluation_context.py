import asyncio

import pytest

from backend.coaching.config import Settings
from backend.coaching.schemas import Decision
from backend.coaching.service import ClassifierService
from backend.integrations.mock_models import MockClassifier
from evals.task import classify_task


def service_for(profile, policy):
    profile = profile.model_copy(
        update={
            "site": "offline-benchmark",
            "website_aliases": [],
            "website_target_label": "",
            "switch_supported": False,
            "website_equivalence_verified": False,
        }
    )
    policy = policy.model_copy(update={"profile_fingerprint": profile.fingerprint})
    return ClassifierService(
        Settings(coaching_mode="suggest"), profile, policy, MockClassifier()
    )


def test_evaluation_without_website_preserves_candidate_only(req, profile, policy):
    service = service_for(profile, policy)
    request = req.model_copy(update={"target_available": False})
    decision = Decision.model_validate(
        asyncio.run(classify_task(service, request.model_dump_json()))
    )
    assert decision.prediction is not None
    assert decision.candidate_action == "suggest_small"
    assert decision.response.action == "abstain"
    assert decision.response.target is None and decision.response.message is None
    # Calling the ordinary API path still enforces website eligibility.
    ordinary = asyncio.run(service.classify(request))
    assert ordinary.prediction is None
    assert ordinary.response.reason_code == "unsupported_model"
    assert not service.profile.switch_supported
    assert service.settings.coaching_mode == "suggest"


@pytest.mark.parametrize(
    "change,reason",
    [
        ({"opted_in": False}, "not_opted_in"),
        ({"context_available": False}, "context_unavailable"),
        ({"context_truncated": True}, "context_truncated"),
        ({"has_attachments": True}, "unsupported_capability"),
        ({"uses_tools": True}, "unsupported_capability"),
        ({"prompt_text": " "}, "empty_prompt"),
    ],
)
def test_evaluation_retains_input_guards(req, profile, policy, change, reason):
    service = service_for(profile, policy)

    class Never:
        async def predict(self, *args):
            raise AssertionError("ineligible input dispatched")

    service.client = Never()
    result = asyncio.run(
        classify_task(service, req.model_copy(update=change).model_dump_json())
    )
    assert result["prediction"] is None
    assert result["response"]["reason_code"] == reason


def test_evaluation_retains_threshold_and_model_pin(req, profile, policy):
    service = service_for(profile, policy)
    service.policy = service.policy.model_copy(update={"threshold": 0.99})
    result = asyncio.run(classify_task(service, req.model_dump_json()))
    assert result["candidate_action"] == "abstain"
    assert result["response"]["reason_code"] == "below_threshold"
    service.profile = service.profile.model_copy(
        update={"expected_jev_resolved_model": "unexpected"}
    )
    result = asyncio.run(classify_task(service, req.model_dump_json()))
    assert result["response"]["reason_code"] == "model_version_mismatch"


def test_request_cannot_enable_evaluation(req, profile, policy):
    import json

    payload = req.model_dump(mode="json")
    payload["evaluation"] = True
    with pytest.raises(ValueError):
        asyncio.run(classify_task(service_for(profile, policy), json.dumps(payload)))

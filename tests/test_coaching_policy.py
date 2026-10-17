import asyncio

import pytest

from backend.coaching.config import Settings
from backend.coaching.footprint_contract import Estimate, net_saving
from backend.coaching.policy import choose
from backend.coaching.service import ClassifierService, Saturated
from backend.integrations.mock_models import MockClassifier


def prediction(req, profile):
    return asyncio.run(MockClassifier().predict(req, profile))


def test_threshold_shadow_and_versions(req, profile, policy):
    pred = prediction(req, profile)
    assert choose(pred, profile, policy, "mock", "suggest")[0] == "suggest_small"
    assert choose(pred, profile, policy, "mock", "shadow")[:2] == (
        "abstain",
        "suggest_small",
    )
    assert (
        choose(
            pred,
            profile,
            policy.model_copy(update={"threshold": 0.99}),
            "mock",
            "suggest",
        )[2]
        == "below_threshold"
    )
    assert (
        choose(
            pred,
            profile,
            policy.model_copy(update={"profile_fingerprint": "wrong"}),
            "mock",
            "suggest",
        )[2]
        == "policy_mismatch"
    )
    assert choose(pred, profile, policy, "live", "suggest")[0] == "abstain"


@pytest.mark.parametrize(
    "fixture,action",
    [("smoke-1", "keep_current"), ("smoke-2", "abstain"), ("unknown", "abstain")],
)
def test_labels(fixture, action, req, profile, policy):
    pred = prediction(req.model_copy(update={"mock_fixture_id": fixture}), profile)
    assert choose(pred, profile, policy, "mock", "suggest")[0] == action


@pytest.mark.parametrize(
    "change,reason",
    [
        ({"opted_in": False}, "not_opted_in"),
        ({"prompt_text": "  "}, "empty_prompt"),
        ({"has_attachments": True}, "unsupported_capability"),
        ({"uses_tools": True}, "unsupported_capability"),
        ({"modality": "image"}, "unsupported_capability"),
        ({"context_truncated": True}, "context_truncated"),
        ({"context_available": False}, "context_unavailable"),
        ({"current_model_label": "Auto"}, "unsupported_model"),
        ({"site": "claude"}, "unsupported_model"),
        ({"target_available": False}, "target_unavailable"),
    ],
)
def test_preflight_skips_provider(change, reason, req, profile, policy):
    class Never:
        async def predict(self, *args):
            raise AssertionError("unexpected call")

    service = ClassifierService(Settings(), profile, policy, Never())
    result = asyncio.run(service.classify(req.model_copy(update=change)))
    assert result.response.reason_code == reason and result.prediction is None


def test_total_deadline_and_cancellation(req, profile, policy):
    class Slow:
        cancelled = False

        async def predict(self, *args):
            try:
                await asyncio.sleep(10)
            finally:
                self.cancelled = True

    slow = Slow()
    service = ClassifierService(Settings(deadline_ms=10), profile, policy, slow)
    result = asyncio.run(service.classify(req))
    assert (
        result.response.reason_code == "timeout"
        and slow.cancelled
        and service.inflight == 0
    )


def test_saturation_no_queue(req, profile, policy):
    async def run():
        entered = asyncio.Event()
        release = asyncio.Event()

        class Blocked:
            async def predict(self, request, profile):
                entered.set()
                await release.wait()
                return await MockClassifier().predict(request, profile)

        service = ClassifierService(
            Settings(max_concurrency=1), profile, policy, Blocked()
        )
        first = asyncio.create_task(service.classify(req))
        await entered.wait()
        with pytest.raises(Saturated):
            await service.classify(req)
        release.set()
        await first
        assert service.inflight == 0

    asyncio.run(run())


def test_live_missing_config_never_mock():
    with pytest.raises(ValueError):
        Settings(mode="live")


def test_unknown_footprint_and_interval():
    assert net_saving(None, None, None) is None

    def interval(low, high, unit="Wh"):
        return Estimate(
            low=low,
            high=high,
            unit=unit,
            basis="fixture",
            assumptions=[],
            version="fixture-v1",
        )

    result = net_saving(interval(10, 20), interval(3, 5), interval(1, 2))
    assert (result.low, result.high) == (3, 16)
    with pytest.raises(ValueError):
        net_saving(interval(10, 20), interval(3, 5, "g"), interval(1, 2))


def test_expired_absolute_deadline_never_dispatches(req, profile, policy):
    import time

    class Never:
        async def predict(self, *args):
            raise AssertionError("expired request dispatched")

    service = ClassifierService(Settings(), profile, policy, Never())
    result = asyncio.run(service.classify(req, started=time.monotonic() - 1))
    assert result.response.reason_code == "timeout"


def test_resolved_model_change_invalidates_policy(req, profile, policy):
    pred = prediction(req, profile)
    pinned = profile.model_copy(
        update={"expected_jev_resolved_model": "different-version"}
    )
    assert (
        choose(pred, pinned, policy, "mock", "suggest")[2] == "model_version_mismatch"
    )


def test_profile_policy_roundtrip_preserves_suggestions(req, profile, policy, tmp_path):
    profile_path = tmp_path / "profile.json"
    policy_path = tmp_path / "policy.json"
    profile_path.write_text(profile.model_dump_json())
    policy_path.write_text(policy.model_dump_json())
    config = Settings(
        profile_path=str(profile_path),
        policy_path=str(policy_path),
        coaching_mode="suggest",
    )
    loaded_profile, loaded_policy = config.artifacts()
    assert loaded_profile.fingerprint == profile.fingerprint
    result = asyncio.run(
        ClassifierService(
            config, loaded_profile, loaded_policy, MockClassifier()
        ).classify(req)
    )
    assert result.response.action == "suggest_small"

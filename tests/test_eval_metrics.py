import asyncio

import pytest

from backend.coaching.config import Settings
from backend.coaching.service import ClassifierService
from backend.integrations.mock_models import MockClassifier
from evals.metrics import metrics, upper_bound
from evals.scorers import score
from evals.tune import tune


def record(req, profile, policy, fixture, truth):
    output = asyncio.run(
        ClassifierService(Settings(), profile, policy, MockClassifier()).classify(
            req.model_copy(update={"mock_fixture_id": fixture})
        )
    ).model_dump(mode="json")
    return {
        "split": "dev",
        "family": "fixture",
        "reference": {"small_adequate": truth, "large_adequate": True},
        "output": output,
        "error": None,
    }


def test_full_confusion_counts(req, profile, policy):
    rows = [
        record(req, profile, policy, "smoke-0", True),
        record(req, profile, policy, "smoke-0", False),
        record(req, profile, policy, "smoke-1", True),
        record(req, profile, policy, "smoke-1", False),
    ]
    result = metrics(rows)
    assert result["counts"] == {
        "N": 4,
        "V": 4,
        "R": 4,
        "S_all": 2,
        "S": 2,
        "H": 1,
        "A": 2,
        "M": 1,
    }
    for key in [
        "harmful_recommendation_rate",
        "missed_opportunity_rate",
        "raw_binary_agreement_valid_resolved_non_uncertain",
    ]:
        assert result["ratios"][key]["value"] == 0.5
    assert (
        result["abstentions"] == 4
    )  # Candidate metrics remain available in shadow mode.


def test_unknown_references_and_runtime_failure(req, profile, policy):
    rows = [
        record(req, profile, policy, "smoke-0", None),
        {"reference": {"small_adequate": False}, "output": None, "error": "timeout"},
    ]
    stats = metrics(rows)
    assert stats["counts"] == {
        "N": 2,
        "V": 1,
        "R": 0,
        "S_all": 1,
        "S": 0,
        "H": 0,
        "A": 0,
        "M": 0,
    }
    assert stats["ratios"]["harmful_recommendation_rate"]["value"] is None
    assert stats["unresolved_references"] == 1 and stats["failed_with_reference"] == 1
    assert score(None, None)["binary_agreement"] == 0


def test_empty_metrics():
    stats = metrics([])
    assert all(r["value"] is None for r in stats["ratios"].values())
    assert stats["harmful_rate_upper_95"] is None


@pytest.mark.parametrize(
    "n,expected", [(60, 0.04870291331), (120, 0.02465540106), (149, 0.01990481666)]
)
def test_exact_zero_failure_bounds(n, expected):
    assert upper_bound(0, n) == pytest.approx(expected, abs=1e-9)


def test_nonzero_exact_bound():
    assert upper_bound(1, 2) == pytest.approx(0.9746794344808963)
    assert upper_bound(2, 2) == 1
    with pytest.raises(ValueError):
        upper_bound(3, 2)


def test_tune_dev_only_and_no_selection(req, profile, policy):
    rows = [
        record(req, profile, policy, "smoke-0", True),
        record(req, profile, policy, "smoke-0", False),
    ]
    assert (
        tune(rows, profile, "mock", "rev", target=0, min_support=1).status == "shadow"
    )
    chosen = tune(rows[:1], profile, "mock", "rev", target=0, min_support=1)
    assert chosen.status == "provisional" and chosen.threshold == 0.94
    rows[0]["split"] = "test"
    with pytest.raises(ValueError, match="development"):
        tune(rows, profile, "mock", "rev")


def test_duplicate_groups_have_no_independent_binomial_claim(req, profile, policy):
    rows = [record(req, profile, policy, "smoke-0", True) for _ in range(2)]
    for row in rows:
        row["group_id"] = "one-conversation"
    result = metrics(rows)
    assert result["counts"]["S"] == 2
    assert result["harmful_rate_upper_95"] is None
    assert not result["independent_groups"]


def test_unsupported_inputs_do_not_inflate_binary_evidence(req, profile, policy):
    supported = record(req, profile, policy, "smoke-0", True)
    unsupported = record(
        req.model_copy(update={"has_attachments": True}),
        profile,
        policy,
        "smoke-0",
        True,
    )
    result = metrics([supported, unsupported])
    assert result["attempted_inputs"] == 2 and result["counts"]["N"] == 1
    assert result["ineligible_inputs"] == {"unsupported_capability": 1}

import asyncio
import json

import pytest

from backend.coaching.config import Settings
from backend.integrations.chalk_gateway import GatewayError
from evals.checkpoints import BudgetExceeded, Checkpoints
from evals.data import load_dataset, revision, write_dataset
from evals.prepare import prepare
from evals.publish import validate_publication
from evals.review import apply_review, export_review
from evals.run_local import run


def test_preparation_resume_and_model_change(tmp_path):
    rows = load_dataset("evals/datasets/smoke.jsonl")
    cp = Checkpoints(tmp_path / "prep.db")
    try:
        prepared = asyncio.run(
            prepare(rows, Settings(), cp, "mock-v1", tmp_path / "prepared.jsonl")
        )
        calls = cp.db.execute("SELECT count(*) FROM attempts").fetchone()[0]
        assert (
            calls >= 30
            and prepared[7].reference.small_adequate is False
            and prepared[7].reference.large_adequate is False
        )
        assert prepared[2].reference.small_adequate is None
        again = asyncio.run(
            prepare(rows, Settings(), cp, "mock-v1", tmp_path / "prepared.jsonl")
        )
        assert revision(again) == revision(prepared)
        assert cp.db.execute("SELECT count(*) FROM attempts").fetchone()[0] == calls
        asyncio.run(
            prepare(rows[:1], Settings(), cp, "mock-v2", tmp_path / "new.jsonl")
        )
        assert cp.db.execute("SELECT count(*) FROM attempts").fetchone()[0] > calls
    finally:
        cp.close()


def test_mock_end_to_end_and_publication(tmp_path):
    prep = Checkpoints(tmp_path / "prep.db")
    classification = Checkpoints(tmp_path / "classify.db")
    try:
        rows = asyncio.run(
            prepare(
                load_dataset("evals/datasets/smoke.jsonl"),
                Settings(),
                prep,
                "v1",
                tmp_path / "prepared.jsonl",
            )
        )
        report = asyncio.run(
            run(rows, Settings(), classification, "dev", tmp_path / "report.json")
        )
        assert report.source_mode == "mock" and report.evidence_status == "mock_only"
        assert report.metrics.counts["N"] == 5 and report.chalk_run_status == "not_run"
        validate_publication(report)
        with pytest.raises(ValueError):
            validate_publication(report.model_copy(update={"source_mode": "live"}))
        text = report.model_dump_json()
        assert all(r.request.prompt_text not in text for r in rows)
        before = classification.db.execute("SELECT count(*) FROM attempts").fetchone()[
            0
        ]
        asyncio.run(
            run(rows, Settings(), classification, "dev", tmp_path / "report.json")
        )
        assert (
            classification.db.execute("SELECT count(*) FROM attempts").fetchone()[0]
            == before
        )
    finally:
        prep.close()
        classification.close()


def test_group_split_and_duplicate_validation(tmp_path):
    rows = load_dataset("evals/datasets/smoke.jsonl")
    rows[5] = rows[5].model_copy(update={"group_id": rows[0].group_id})
    path = tmp_path / "bad.jsonl"
    write_dataset(path, rows)
    with pytest.raises(ValueError, match="cross"):
        load_dataset(path)
    write_dataset(path, [rows[0], rows[0]])
    with pytest.raises(ValueError, match="duplicate"):
        load_dataset(path)


def test_review_revision_and_provenance(tmp_path):
    rows = load_dataset("evals/datasets/smoke.jsonl")
    path = tmp_path / "review.json"
    export_review(rows, path, random_count=2, targeted_ids=["smoke-9"])
    review = json.loads(path.read_text())
    item = review["reviews"][0]
    item.update(
        confirmed=True,
        reviewer_id="reviewer-1",
        reason="Checked against reference",
        small_adequate=False,
    )
    result = apply_review(rows, review)
    row = next(r for r in result if r.task_id == item["task_id"])
    assert row.reference.source == "human" and row.reference.small_adequate is False
    review["dataset_revision"] = "wrong"
    with pytest.raises(ValueError, match="revision"):
        apply_review(rows, review)


def test_retry_caps_and_success_checkpoint(tmp_path):
    cp = Checkpoints(tmp_path / "cp.db", max_calls=2)
    calls = 0

    async def fail():
        nonlocal calls
        calls += 1
        raise GatewayError("provider_rate_limit", 0.001)

    try:
        with pytest.raises(GatewayError):
            asyncio.run(cp.call("x", {}, fail, retries=1))
        assert calls == 2
        with pytest.raises(BudgetExceeded):
            asyncio.run(cp.call("x", {}, fail, retries=1))
        assert calls == 2
    finally:
        cp.close()


def test_auth_failure_never_retries(tmp_path):
    cp = Checkpoints(tmp_path / "cp.db")

    async def fail():
        raise GatewayError("provider_auth")

    try:
        with pytest.raises(GatewayError):
            asyncio.run(cp.call("x", {}, fail, retries=5))
        assert cp.db.execute("SELECT count(*) FROM attempts").fetchone()[0] == 1
    finally:
        cp.close()


def test_dollar_budget_without_prices_is_rejected(tmp_path):
    with pytest.raises(ValueError, match="pricing"):
        Checkpoints(tmp_path / "cp.db", max_cost_usd=1)


def test_review_keeps_mock_origin(tmp_path):
    from evals.data import Reference

    rows = load_dataset("evals/datasets/smoke.jsonl")[:1]
    rows[0] = rows[0].model_copy(
        update={
            "reference": Reference(
                source="mock", origin_mode="mock", small_adequate=True
            )
        }
    )
    path = tmp_path / "review.json"
    export_review(rows, path, random_count=1)
    review = json.loads(path.read_text())
    review["reviews"][0].update(confirmed=True, reviewer_id="r", reason="reviewed")
    updated = apply_review(rows, review)[0].reference
    assert updated.source == "human" and updated.origin_mode == "mock"

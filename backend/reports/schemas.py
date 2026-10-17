from typing import Literal

from pydantic import Field

from backend.coaching.schemas import Contract


class Ratio(Contract):
    numerator: int = Field(ge=0)
    denominator: int = Field(ge=0)
    value: float | None


class ReviewCounts(Contract):
    reviewed: int
    agreement: int
    comparable: int


class Metrics(Contract):
    attempted_inputs: int
    ineligible_inputs: dict[str, int]
    independent_group_count: int
    independent_groups: bool
    actual_suggestions: int
    counts: dict[str, int]
    ratios: dict[str, Ratio]
    harmful_rate_upper_95: float | None
    abstentions: int
    uncertain_predictions: int
    unresolved_references: int
    reference_resolved_attempted: int
    failed_with_reference: int
    judge_disagreements: int
    both_answers_fail: int
    errors: dict[str, int]
    latency_ms: dict[str, float | None]
    human_review: dict[str, ReviewCounts]


class Report(Contract):
    status: Literal["completed"] = "completed"
    source_mode: Literal["mock", "live"]
    chalk_run_status: Literal[
        "not_run", "SUCCEEDED", "FAILED", "CANCELED", "PENDING", "RUNNING", "FINALIZING"
    ] = "not_run"
    dataset_revision: str
    profile_fingerprint: str
    policy_version: str
    policy_status: str
    rubric_hash: str
    model_ids: list[str]
    resolved_model_ids: list[str]
    split: Literal["dev", "test"]
    metrics: Metrics
    slices: dict[str, Metrics]
    savings: None = None
    financial_cost_usd: None = None
    recommendation_basis: Literal["candidate_action"] = "candidate_action"
    interval_assumptions: str = (
        "One-sided 95% exact binomial bound; requires representative independent tasks. Tiny slices are unstable."
    )
    evidence_status: Literal[
        "mock_only", "empirical_only", "interval_support", "unsupported"
    ]
    harmful_rate_target: float = Field(ge=0, le=1)
    code_revision: str
    chalk_evaluation_id: str | None = None
    chalk_run_id: str | None = None
    chalk_dataset_revision: str | None = None

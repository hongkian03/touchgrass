from typing import Literal

from pydantic import Field, model_validator

from .rubric import RUBRIC_HASH, fingerprint
from .schemas import Contract, Probability


class Generation(Contract):
    max_tokens: int = Field(default=1024, ge=1, le=16000)
    token_limit_parameter: Literal["max_tokens", "max_completion_tokens"] = "max_tokens"
    temperature: float | None = Field(default=0.0, ge=0, le=2, allow_inf_nan=False)
    seed: int | None = None


class CoachingProfile(Contract):
    profile_id: str
    version: str
    validity: Literal["mock", "provisional", "evaluated", "disabled"]
    site: str = "chatgpt"
    large_model_id: str
    small_model_id: str
    jev_model_id: str
    expected_jev_resolved_model: str | None = None
    website_aliases: list[str]
    website_target_label: str
    switch_supported: bool = False
    website_equivalence_verified: bool = False
    small_capabilities: str = Field(min_length=1, max_length=4000)
    small_generation: Generation = Field(default_factory=Generation)
    large_generation: Generation = Field(default_factory=Generation)
    judge_generation: Generation = Field(
        default_factory=lambda: Generation(max_tokens=2048)
    )
    rubric_hash: str = RUBRIC_HASH
    calibration_revision: str | None = None

    @property
    def fingerprint(self):
        return fingerprint(self.model_dump())


class Policy(Contract):
    version: str
    status: Literal["shadow", "provisional", "approved"] = "shadow"
    profile_fingerprint: str
    threshold: Probability = 1.0
    tuning_revision: str | None = None
    evidence_revision: str | None = None
    source_mode: Literal["mock", "live"] = "mock"

    @model_validator(mode="after")
    def approved_evidence(self):
        if self.status == "approved" and (
            self.source_mode != "live" or not self.evidence_revision
        ):
            raise ValueError("approval requires live evidence revision")
        return self


def mock_profile():
    return CoachingProfile(
        profile_id="synthetic-pair",
        version="mock-v1",
        validity="mock",
        large_model_id="mock/large",
        small_model_id="mock/small",
        jev_model_id="mock/jev",
        website_aliases=["Mock Large"],
        website_target_label="Mock Small",
        switch_supported=True,
        small_capabilities="Synthetic fixtures only; no measured model capabilities.",
    )

from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

Label = Literal["small_ok", "needs_big", "uncertain"]
Action = Literal["suggest_small", "keep_current", "abstain"]
Probability = Annotated[float, Field(ge=0, le=1, allow_inf_nan=False, strict=True)]


class Contract(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        hide_input_in_errors=True,
        allow_inf_nan=False,
        validate_default=True,
    )


class Message(Contract):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=8000)


class ClassifyRequest(Contract):
    request_id: UUID
    draft_revision: int = Field(ge=0, strict=True)
    conversation_id: str = Field(min_length=1, max_length=200)
    site: str = Field(max_length=40)
    current_model_label: str = Field(max_length=200)
    prompt_text: str = Field(max_length=12000)
    recent_messages: list[Message] = Field(default_factory=list, max_length=4)
    opted_in: bool = Field(default=False, strict=True)
    context_available: bool = Field(default=True, strict=True)
    context_truncated: bool = Field(default=False, strict=True)
    has_attachments: bool = Field(default=False, strict=True)
    uses_tools: bool = Field(default=False, strict=True)
    modality: str = Field(default="text", max_length=40)
    target_available: bool = Field(default=False, strict=True)
    mock_fixture_id: str | None = Field(default=None, max_length=80)

    @model_validator(mode="after")
    def bounded_context(self):
        if sum(len(m.content) for m in self.recent_messages) > 8000:
            raise ValueError("context exceeds 8000 characters")
        return self


class Choice(BaseModel):
    model_config = ConfigDict(extra="allow")
    type: Literal["choice"]
    choice: Label
    probabilities: dict[Label, Probability]
    confidence: Probability

    @model_validator(mode="after")
    def distribution(self):
        if set(self.probabilities) != {"small_ok", "needs_big", "uncertain"}:
            raise ValueError("exactly three probabilities required")
        if abs(sum(self.probabilities.values()) - 1) > 0.01:
            raise ValueError("probabilities must sum to one")
        if self.probabilities[self.choice] < max(self.probabilities.values()):
            raise ValueError("choice must maximize probability")
        return self


class Prediction(Contract):
    label: Label
    probabilities: dict[Label, Probability]
    confidence: Probability
    requested_model: str
    resolved_model: str
    rubric_hash: str
    elapsed_ms: float = Field(ge=0, allow_inf_nan=False)
    usage: dict[str, int] = Field(default_factory=dict)


class Target(Contract):
    model_id: str
    website_label: str


class ClassifyResponse(Contract):
    request_id: UUID
    draft_revision: int
    conversation_id: str
    site: str
    current_model_label: str
    decision_id: UUID
    mode: Literal["mock", "live"]
    classification: Label | None
    action: Action
    reason_code: str
    target: Target | None = None
    estimated_savings: None = None
    message: str | None = None
    profile_version: str
    policy_version: str
    policy_status: str
    elapsed_ms: float
    ttl_ms: int = 30000


class Decision(Contract):
    response: ClassifyResponse
    prediction: Prediction | None = None
    candidate_action: Action = "abstain"


class CoachingEvent(Contract):
    event_id: UUID
    decision_id: UUID
    draft_revision: int = Field(ge=0, strict=True)
    event_type: Literal[
        "shown",
        "dismissed",
        "switch_clicked",
        "switch_confirmed",
        "sent_anyway",
        "sent_with_target",
        "expired",
        "late_result",
    ]
    client_time: str | None = Field(default=None, max_length=80)
    source_label: str | None = Field(default=None, max_length=200)
    target_label: str | None = Field(default=None, max_length=200)
    exchange_id: UUID | None = None

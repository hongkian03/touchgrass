"""One general task-fit prediction, mapped to the current provider's lighter option.

The existing pair evaluation supplies a provisional threshold. This module does
not turn that evidence into provider-specific accuracy or savings claims.
"""

import re
from pathlib import Path

from pydantic import Field, model_validator

from .policy import choose
from .profiles import CoachingProfile, Policy
from .schemas import Contract, Probability, Target
from .service import ClassifierService


class ProviderTarget(Contract):
    site: str = Field(min_length=1)
    lightweight_patterns: list[str] = Field(default_factory=list)
    target_model_id: str = Field(min_length=1)
    target_label: str = Field(min_length=1)
    target_aliases: list[str] = Field(min_length=1)

    @model_validator(mode="after")
    def patterns_valid(self):
        for pattern in self.lightweight_patterns:
            re.compile(pattern, re.IGNORECASE)
        return self

    def already_lightweight(self, label):
        label = " ".join(label.split())
        if label.casefold() in {x.casefold() for x in self.target_aliases}:
            return True
        return any(
            re.search(p, label, re.IGNORECASE) for p in self.lightweight_patterns
        )


class GeneralCoachConfig(Contract):
    version: str
    jev_model_id: str
    expected_jev_resolved_model: str
    capabilities: str = Field(min_length=1, max_length=4000)
    threshold: Probability
    threshold_basis: str
    source_evaluation_id: str
    source_run_id: str
    evidence_note: str
    providers: list[ProviderTarget] = Field(min_length=1)

    @model_validator(mode="after")
    def unique_sites(self):
        sites = [x.site for x in self.providers]
        if len(sites) != len(set(sites)):
            raise ValueError("duplicate provider mapping")
        return self

    @classmethod
    def load(cls, path):
        return cls.model_validate_json(Path(path).read_text(encoding="utf-8"))

    def provider(self, site):
        return next((p for p in self.providers if p.site == site), None)


class GeneralCoachService(ClassifierService):
    def __init__(self, settings, config, client):
        if settings.mode == "live" and config.jev_model_id != settings.jev_model_id:
            raise ValueError("general coach Jev ID differs from configured ID")
        self.config = config
        profile = CoachingProfile(
            profile_id="general-lightweight-task-fit",
            version=config.version,
            validity="provisional",
            site="general",
            large_model_id="class/powerful",
            small_model_id="class/lightweight",
            jev_model_id=config.jev_model_id,
            expected_jev_resolved_model=config.expected_jev_resolved_model,
            website_aliases=[],
            website_target_label="provider's lightweight model",
            small_capabilities=config.capabilities,
            # This is explicitly a generalization, not measured website/API equivalence.
            website_equivalence_verified=False,
        )
        policy = Policy(
            version=config.version,
            status="provisional",
            source_mode="live",
            threshold=config.threshold,
            profile_fingerprint=profile.fingerprint,
        )
        super().__init__(settings, profile, policy, client)

    def skip_reason(self, req, *, evaluation=False):
        # Reuse consent, context, modality, deadline and identity checks. Only the
        # pair-specific website mapping is replaced with the provider mapping.
        # Source labels are metadata, not an eligibility whitelist. A picker can
        # expose a mode such as "Thinking effortHigh" instead of a model name.
        reason = super().skip_reason(req, evaluation=True)
        if reason:
            return reason
        provider = self.config.provider(req.site)
        if not provider:
            return "no_configured_target"
        if provider.already_lightweight(req.current_model_label):
            return "already_lightweight"
        if not req.target_available:
            return "target_unavailable"
        return None

    def select(self, pred, evaluation):
        return choose(
            pred,
            self.profile,
            self.policy,
            self.settings.mode,
            "shadow" if evaluation else self.settings.coaching_mode,
            require_website_equivalence=False,
        )

    def target_for(self, req):
        provider = self.config.provider(req.site)
        return Target(
            model_id=provider.target_model_id, website_label=provider.target_label
        )

    async def classify(self, req, started=None, *, evaluation=False):
        decision = await super().classify(req, started, evaluation=evaluation)
        decision.response.recommendation_scope = "generalized"
        decision.response.evidence_note = self.config.evidence_note
        return decision

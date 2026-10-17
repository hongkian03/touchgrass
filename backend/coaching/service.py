import asyncio
import time
from uuid import uuid4

from backend.integrations.chalk_gateway import GatewayError

from .policy import choose
from .schemas import ClassifyResponse, Decision, Target


class Saturated(Exception):
    pass


class ClassifierService:
    def __init__(self, settings, profile, policy, client):
        self.settings, self.profile, self.policy, self.client = (
            settings,
            profile,
            policy,
            client,
        )
        self.inflight = 0

    def skip_reason(self, req):
        if not req.opted_in:
            return "not_opted_in"
        if not req.prompt_text.strip():
            return "empty_prompt"
        if req.has_attachments or req.uses_tools or req.modality != "text":
            return "unsupported_capability"
        if req.context_truncated:
            return "context_truncated"
        if not req.context_available:
            return "context_unavailable"
        if self.profile.validity == "disabled":
            return "unsupported_profile"
        if (
            req.site != self.profile.site
            or req.current_model_label not in self.profile.website_aliases
        ):
            return "unsupported_model"
        if not self.profile.switch_supported or not req.target_available:
            return "target_unavailable"
        if self.settings.mode == "live" and req.mock_fixture_id is not None:
            return "mock_fixture_in_live"
        return None

    async def classify(self, req, started=None):
        start = time.monotonic() if started is None else started
        # Reserve time for metadata persistence and response serialization.
        reserve_ms = min(50, self.settings.deadline_ms / 10)
        deadline = start + (self.settings.deadline_ms - reserve_ms) / 1000
        reason, pred, action, candidate = (
            self.skip_reason(req),
            None,
            "abstain",
            "abstain",
        )
        if reason is None:
            if self.inflight >= self.settings.max_concurrency:
                raise Saturated()
            self.inflight += 1  # No await between capacity check and reservation.
            try:
                if time.monotonic() >= deadline:
                    raise TimeoutError()
                async with asyncio.timeout_at(deadline):
                    pred = await self.client.predict(req, self.profile)
                    action, candidate, reason = choose(
                        pred,
                        self.profile,
                        self.policy,
                        self.settings.mode,
                        self.settings.coaching_mode,
                    )
                if time.monotonic() >= deadline:
                    raise TimeoutError()
            except TimeoutError:
                pred, action, candidate, reason = None, "abstain", "abstain", "timeout"
            except GatewayError as exc:
                reason = exc.category
            finally:
                self.inflight -= 1
        target = (
            Target(
                model_id=self.profile.small_model_id,
                website_label=self.profile.website_target_label,
            )
            if action == "suggest_small"
            else None
        )
        return Decision(
            response=ClassifyResponse(
                request_id=req.request_id,
                draft_revision=req.draft_revision,
                conversation_id=req.conversation_id,
                site=req.site,
                current_model_label=req.current_model_label,
                decision_id=uuid4(),
                mode=self.settings.mode,
                classification=pred.label if pred else None,
                action=action,
                reason_code=reason,
                target=target,
                message=(
                    f"This task may work well with {target.website_label}."
                    if target
                    else None
                ),
                profile_version=self.profile.version,
                policy_version=self.policy.version,
                policy_status=self.policy.status,
                elapsed_ms=(time.monotonic() - start) * 1000,
            ),
            prediction=pred,
            candidate_action=candidate,
        )

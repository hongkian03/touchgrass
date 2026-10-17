import math
import time
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

import httpx
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from backend.coaching.rubric import RUBRIC_HASH, payload_for
from backend.coaching.schemas import Choice, Prediction


class GatewayError(Exception):
    def __init__(self, category, retry_after=None):
        super().__init__(category)  # Never retain response bodies or request headers.
        self.category = category
        self.retry_after = retry_after


def retry_delay(value):
    if not value:
        return None
    try:
        seconds = float(value)
    except ValueError:
        try:
            seconds = (
                parsedate_to_datetime(value) - datetime.now(timezone.utc)
            ).total_seconds()
        except (ValueError, TypeError, OverflowError):
            return None
    return max(0.0, seconds) if math.isfinite(seconds) else None


class Envelope(BaseModel):
    model_config = ConfigDict(extra="allow")
    model: str = Field(min_length=1)
    answers: dict[str, object]
    usage: dict[str, int] = Field(default_factory=dict)


class Answer(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: str
    requested_model: str
    resolved_model: str
    finish_reason: str
    usage: dict[str, int]
    elapsed_ms: float
    valid: bool


class Gateway:
    def __init__(self, client: httpx.AsyncClient, settings):
        self.client, self.settings = client, settings

    async def request(self, method, path, payload=None, timeout=30):
        try:
            response = await self.client.request(
                method,
                self.settings.router_base_url + path,
                headers={
                    "Authorization": "Bearer "
                    + self.settings.router_api_key.get_secret_value(),
                    "X-Chalk-Env-Id": self.settings.env_id,
                },
                json=payload,
                timeout=timeout,
            )
            if response.status_code >= 300:
                status = response.status_code
                category = (
                    "provider_auth"
                    if status in (401, 403)
                    else (
                        "provider_rate_limit"
                        if status == 429
                        else (
                            "provider_unavailable"
                            if status >= 500
                            else "provider_rejected"
                        )
                    )
                )
                retry_after = retry_delay(response.headers.get("Retry-After"))
                raise GatewayError(category, retry_after)
            return response.json()
        except httpx.TimeoutException:
            raise GatewayError("timeout") from None
        except httpx.RequestError:
            raise GatewayError("connection_error") from None
        except ValueError:
            raise GatewayError("invalid_output") from None

    async def predict(self, request, profile):
        start = time.monotonic()
        data = await self.request(
            "POST",
            "/v1/systemone",
            payload_for(request, profile),
            self.settings.deadline_ms / 1000,
        )
        try:
            envelope = Envelope.model_validate(data)
            answer = Choice.model_validate(envelope.answers["model_fit"])
            return Prediction(
                label=answer.choice,
                probabilities=answer.probabilities,
                confidence=answer.confidence,
                requested_model=profile.jev_model_id,
                resolved_model=envelope.model,
                rubric_hash=RUBRIC_HASH,
                elapsed_ms=(time.monotonic() - start) * 1000,
                usage=envelope.usage,
            )
        except (ValidationError, KeyError, TypeError):
            raise GatewayError("invalid_output") from None

    async def chat(self, model, messages, generation):
        start = time.monotonic()
        options = generation.model_dump(
            exclude_none=True, exclude={"max_tokens", "token_limit_parameter"}
        )
        options[generation.token_limit_parameter] = generation.max_tokens
        data = await self.request(
            "POST",
            "/chat/completions",
            {
                "model": model,
                "messages": messages,
                **options,
            },
        )
        try:
            item = data["choices"][0]
            message = item["message"]
            content = message["content"]
            if not isinstance(content, str) or not isinstance(data["model"], str):
                raise ValueError()
            usage = data.get("usage")
            if usage is None:
                usage = {}
            if not isinstance(usage, dict):
                raise ValueError()
            # The public Answer contract stores flat counters. Providers may also
            # return nested usage details; do not flatten and double-count them.
            counters = {k: v for k, v in usage.items() if type(v) is int}
            return Answer(
                text=content,
                requested_model=model,
                resolved_model=data["model"],
                finish_reason=item["finish_reason"],
                usage=counters,
                elapsed_ms=(time.monotonic() - start) * 1000,
                valid=item["finish_reason"] == "stop"
                and not message.get("refusal")
                and bool(content.strip()),
            )
        except (KeyError, IndexError, TypeError, ValueError):
            raise GatewayError("invalid_output") from None

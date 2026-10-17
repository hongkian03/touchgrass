import asyncio
import json

import httpx
import pytest

from backend.coaching.config import Settings
from backend.integrations.chalk_gateway import Gateway, GatewayError


def payload():
    return {
        "model": "resolved/jev-v1",
        "answers": {
            "model_fit": {
                "type": "choice",
                "choice": "small_ok",
                "probabilities": {
                    "small_ok": 0.94,
                    "needs_big": 0.03,
                    "uncertain": 0.03,
                },
                "confidence": 0.91,
            }
        },
        "usage": {"input_tokens": 20, "output_tokens": 4},
        "new_metadata": {"unknown": True},
    }


def predict(handler, req, profile):
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await Gateway(
                client, Settings(router_api_key="secret", env_id="env")
            ).predict(req, profile)

    return asyncio.run(run())


def test_native_gateway_contract(req, profile):
    calls = []

    def handler(request):
        calls.append(request)
        assert str(request.url) == "https://api.chalk.ai/v1/router/v1/systemone"
        assert request.headers["authorization"] == "Bearer secret"
        assert request.headers["x-chalk-env-id"] == "env"
        body = json.loads(request.content)
        assert body["model"] == profile.jev_model_id
        assert set(body["state"]) == {
            "prompt_text",
            "recent_messages",
            "context_available",
            "small_model_capabilities",
        }
        assert "mock_fixture_id" not in body["state"]
        assert body["questions"]["model_fit"]["type"] == "choice"
        return httpx.Response(200, json=payload())

    result = predict(handler, req, profile)
    assert result.label == "small_ok" and result.resolved_model == "resolved/jev-v1"
    assert len(calls) == 1


@pytest.mark.parametrize(
    "change",
    [
        lambda p: p.pop("answers"),
        lambda p: p["answers"].pop("model_fit"),
        lambda p: p["answers"]["model_fit"].update(choice="unknown"),
        lambda p: p["answers"]["model_fit"].update(type="noul"),
        lambda p: p["answers"]["model_fit"]["probabilities"].update(small_ok=1.1),
        lambda p: p["answers"]["model_fit"]["probabilities"].update(small_ok=-0.1),
        lambda p: p["answers"]["model_fit"]["probabilities"].update(small_ok=0.5),
        lambda p: p["answers"]["model_fit"]["probabilities"].pop("uncertain"),
        lambda p: p["answers"]["model_fit"]["probabilities"].update(extra=0),
        lambda p: p["answers"]["model_fit"].update(choice="needs_big"),
        lambda p: p["answers"]["model_fit"].update(confidence="0.9"),
    ],
)
def test_invalid_payload_abstains(change, req, profile):
    data = payload()
    change(data)
    with pytest.raises(GatewayError, match="invalid_output"):
        predict(lambda _: httpx.Response(200, json=data), req, profile)


@pytest.mark.parametrize("value", ["NaN", "Infinity", "-Infinity"])
def test_nonfinite_rejected(value, req, profile):
    raw = json.dumps(payload()).replace("0.94", value)
    with pytest.raises(GatewayError, match="invalid_output"):
        predict(lambda _: httpx.Response(200, content=raw), req, profile)


@pytest.mark.parametrize(
    "status,category",
    [
        (401, "provider_auth"),
        (403, "provider_auth"),
        (429, "provider_rate_limit"),
        (500, "provider_unavailable"),
        (503, "provider_unavailable"),
        (400, "provider_rejected"),
        (302, "provider_rejected"),
    ],
)
def test_errors_single_attempt(status, category, req, profile):
    calls = []

    def handler(r):
        calls.append(r)
        return httpx.Response(status, json={"error": "private prompt secret"})

    with pytest.raises(GatewayError, match=category) as error:
        predict(handler, req, profile)
    assert "private" not in str(error.value)
    assert len(calls) == 1


@pytest.mark.parametrize(
    "exc,category",
    [(httpx.ConnectError, "connection_error"), (httpx.ReadTimeout, "timeout")],
)
def test_network_errors(exc, category, req, profile):
    def handler(r):
        raise exc("private content", request=r)

    with pytest.raises(GatewayError, match=category):
        predict(handler, req, profile)


def test_chat_contract(req, profile):
    async def run():
        def handler(r):
            assert str(r.url).endswith("/router/chat/completions")
            body = json.loads(r.content)
            assert body["max_tokens"] == 1024
            assert body["messages"] == [{"role": "user", "content": "hello"}]
            return httpx.Response(
                200,
                json={
                    "model": "resolved/small",
                    "choices": [
                        {"finish_reason": "length", "message": {"content": "truncated"}}
                    ],
                    "usage": {},
                },
            )

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            answer = await Gateway(client, Settings()).chat(
                "configured/small",
                [{"role": "user", "content": "hello"}],
                profile.small_generation,
            )
            assert not answer.valid

    asyncio.run(run())


def test_unknown_optional_answer_is_not_required(req, profile):
    data = payload()
    data["answers"]["extra_question"] = {"type": "score", "score": 0.5}
    result = predict(lambda _: httpx.Response(200, json=data), req, profile)
    assert result.label == "small_ok"


def test_retry_after_preserves_long_delays_and_http_dates():
    from datetime import datetime, timedelta, timezone
    from email.utils import format_datetime

    from backend.integrations.chalk_gateway import retry_delay

    assert retry_delay("120") == 120
    assert retry_delay("NaN") is None
    assert retry_delay("nonsense") is None
    date = format_datetime(datetime.now(timezone.utc) + timedelta(seconds=120))
    assert 118 < retry_delay(date) <= 120


def test_generation_parameters_can_omit_temperature_and_use_completion_cap(profile):
    async def run():
        def handler(request):
            body = json.loads(request.content)
            assert body["max_completion_tokens"] == 1024
            assert "max_tokens" not in body and "temperature" not in body
            assert "token_limit_parameter" not in body
            return httpx.Response(
                200,
                json={
                    "model": "resolved",
                    "choices": [
                        {"finish_reason": "stop", "message": {"content": "ok"}}
                    ],
                },
            )

        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            generation = profile.small_generation.model_copy(
                update={
                    "temperature": None,
                    "token_limit_parameter": "max_completion_tokens",
                }
            )
            await Gateway(client, Settings()).chat("configured/model", [], generation)

    asyncio.run(run())

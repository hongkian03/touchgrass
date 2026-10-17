"""Deployment module. Import ONLY for an explicitly requested Chalk deployment.

Decorators deploy Functions on import; no datasets or evaluation runs are created here.
"""

import asyncio
import json

import chalkcompute as c

from backend.coaching.config import Settings

from .scorers import score

settings = Settings.from_env()
settings.artifacts()
image = (
    c.Image.debian_slim("3.12")
    .pip_install(["httpx==0.28.1", "pydantic==2.14.1"])
    .add_local_python_source("backend", "evals")
)
env = {
    "PROMPTPRINT_MODE": settings.mode,
    "COACHING_MODE": settings.coaching_mode,
    "CHALK_ROUTER_BASE_URL": settings.router_base_url,
    "CHALK_ENV_ID": settings.env_id,
    "JEV_MODEL_ID": settings.jev_model_id,
    "CLASSIFY_DEADLINE_MS": str(settings.deadline_ms),
}
for source, var, destination in [
    (settings.profile_path, "COACHING_PROFILE_PATH", "/app/profile.json"),
    (settings.policy_path, "COACHING_POLICY_PATH", "/app/policy.json"),
]:
    if source:
        image = image.add_local_file(source, destination, strategy="copy")
        env[var] = destination
secrets = (
    [c.Secret.from_chalk_env("CHALK_ROUTER_API_KEY")] if settings.mode == "live" else []
)


@c.function(
    name="prompt-print-classifier",
    image=image,
    env=env,
    secrets=secrets,
    authenticated=True,
    retries=0,
    concurrency=2,
    min_replicas=0,
    max_replicas=1,
)
def classifier(request_json: str) -> str:
    import httpx

    from backend.coaching.service import ClassifierService
    from backend.integrations.chalk_gateway import Gateway
    from backend.integrations.mock_models import MockClassifier
    from evals.task import classify_task

    async def execute():
        config = Settings.from_env()
        profile, policy = config.artifacts()
        async with httpx.AsyncClient(follow_redirects=False, trust_env=False) as client:
            service = ClassifierService(
                config,
                profile,
                policy,
                MockClassifier() if config.mode == "mock" else Gateway(client, config),
            )
            return await classify_task(service, request_json)

    return json.dumps(asyncio.run(execute()), allow_nan=False)


@c.function(
    name="prompt-print-schema-success",
    image=image,
    authenticated=True,
    retries=0,
    concurrency=2,
    min_replicas=0,
    max_replicas=1,
)
def schema_success(output: str, small_adequate: bool | None) -> float:
    return float(score(output, small_adequate)["schema_success"])


@c.function(
    name="prompt-print-valid",
    image=image,
    authenticated=True,
    retries=0,
    concurrency=2,
    min_replicas=0,
    max_replicas=1,
)
def valid(output: str, small_adequate: bool | None) -> float:
    return float(score(output, small_adequate)["valid"])


@c.function(
    name="prompt-print-resolved",
    image=image,
    authenticated=True,
    retries=0,
    concurrency=2,
    min_replicas=0,
    max_replicas=1,
)
def resolved(output: str, small_adequate: bool | None) -> float:
    return float(score(output, small_adequate)["resolved"])


@c.function(
    name="prompt-print-candidate-recommendation",
    image=image,
    authenticated=True,
    retries=0,
    concurrency=2,
    min_replicas=0,
    max_replicas=1,
)
def candidate_recommendation(output: str, small_adequate: bool | None) -> float:
    return float(score(output, small_adequate)["candidate_recommendation"])


@c.function(
    name="prompt-print-harmful",
    image=image,
    authenticated=True,
    retries=0,
    concurrency=2,
    min_replicas=0,
    max_replicas=1,
)
def harmful(output: str, small_adequate: bool | None) -> float:
    return float(score(output, small_adequate)["harmful"])


@c.function(
    name="prompt-print-missed",
    image=image,
    authenticated=True,
    retries=0,
    concurrency=2,
    min_replicas=0,
    max_replicas=1,
)
def missed(output: str, small_adequate: bool | None) -> float:
    return float(score(output, small_adequate)["missed"])


@c.function(
    name="prompt-print-adequate",
    image=image,
    authenticated=True,
    retries=0,
    concurrency=2,
    min_replicas=0,
    max_replicas=1,
)
def adequate(output: str, small_adequate: bool | None) -> float:
    return float(score(output, small_adequate)["adequate"])


@c.function(
    name="prompt-print-binary-agreement",
    image=image,
    authenticated=True,
    retries=0,
    concurrency=2,
    min_replicas=0,
    max_replicas=1,
)
def binary_agreement(output: str, small_adequate: bool | None) -> float:
    return float(score(output, small_adequate)["binary_agreement"])


@c.function(
    name="prompt-print-binary-denominator",
    image=image,
    authenticated=True,
    retries=0,
    concurrency=2,
    min_replicas=0,
    max_replicas=1,
)
def binary_denominator(output: str, small_adequate: bool | None) -> float:
    return float(score(output, small_adequate)["binary_denominator"])


SCORERS = [
    schema_success,
    valid,
    resolved,
    candidate_recommendation,
    harmful,
    missed,
    adequate,
    binary_agreement,
    binary_denominator,
]

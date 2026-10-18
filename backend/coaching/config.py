import os
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

from pydantic import Field, SecretStr, model_validator

from backend.paths import coaching_database_url

from .profiles import CoachingProfile, Policy, mock_profile
from .rubric import RUBRIC_HASH
from .schemas import Contract


class Settings(Contract):
    mode: Literal["mock", "live"] = "mock"
    coaching_mode: Literal["shadow", "suggest"] = "shadow"
    router_base_url: str = "https://api.chalk.ai/v1/router"
    router_api_key: SecretStr = SecretStr("")
    env_id: str = ""
    jev_model_id: str = ""
    small_model_id: str = ""
    large_model_id: str = ""
    judge_model_id: str = ""
    profile_path: str = ""
    policy_path: str = ""
    general_coach_path: str = ""
    session_secret: SecretStr = SecretStr("")
    database_url: str = Field(default_factory=coaching_database_url)
    allowed_origins: list[str] = Field(default_factory=list)
    deadline_ms: int = Field(default=700, ge=1, le=30000)
    max_concurrency: int = Field(default=8, ge=1, le=1000)
    retention_days: int = Field(default=7, ge=1)

    @model_validator(mode="after")
    def validate_settings(self):
        if not self.database_url.startswith("sqlite:///"):
            raise ValueError("only sqlite:/// database URLs are supported")
        url = urlsplit(self.router_base_url)
        if (
            url.scheme != "https"
            or not url.hostname
            or url.username
            or url.password
            or url.query
            or url.fragment
        ):
            raise ValueError(
                "gateway base must be an HTTPS URL without credentials/query/fragment"
            )
        self.router_base_url = self.router_base_url.rstrip("/")
        if any("*" in o for o in self.allowed_origins):
            raise ValueError("origins must be exact, without wildcards")
        if self.mode == "live" and not all(
            [
                self.router_api_key.get_secret_value(),
                self.env_id,
                self.jev_model_id,
                self.profile_path,
                self.policy_path,
            ]
        ):
            raise ValueError(
                "live mode requires gateway credentials, Jev ID, profile and policy paths"
            )
        return self

    @property
    def db_path(self):
        return self.database_url.removeprefix("sqlite:///")

    @classmethod
    def from_env(cls):
        mapping = {
            "mode": "PROMPTPRINT_MODE",
            "coaching_mode": "COACHING_MODE",
            "router_base_url": "CHALK_ROUTER_BASE_URL",
            "router_api_key": "CHALK_ROUTER_API_KEY",
            "env_id": "CHALK_ENV_ID",
            "jev_model_id": "JEV_MODEL_ID",
            "small_model_id": "SMALL_MODEL_ID",
            "large_model_id": "LARGE_MODEL_ID",
            "judge_model_id": "JUDGE_MODEL_ID",
            "profile_path": "COACHING_PROFILE_PATH",
            "policy_path": "COACHING_POLICY_PATH",
            "general_coach_path": "COACHING_GENERAL_CONFIG_PATH",
            "session_secret": "APP_SESSION_SECRET",
            "database_url": "DATABASE_URL",
            "deadline_ms": "CLASSIFY_DEADLINE_MS",
            "max_concurrency": "CLASSIFY_MAX_CONCURRENCY",
            "retention_days": "METADATA_RETENTION_DAYS",
        }
        values = {k: os.environ[v] for k, v in mapping.items() if os.environ.get(v)}
        values["allowed_origins"] = [
            v.strip() for v in os.getenv("ALLOWED_ORIGINS", "").split(",") if v.strip()
        ]
        return cls(**values)

    def artifacts(self):
        profile = (
            CoachingProfile.model_validate_json(Path(self.profile_path).read_text())
            if self.profile_path
            else mock_profile()
        )
        policy = (
            Policy.model_validate_json(Path(self.policy_path).read_text())
            if self.policy_path
            else Policy(version="shadow-v1", profile_fingerprint=profile.fingerprint)
        )
        if self.mode == "live":
            if profile.validity == "mock" or policy.source_mode != "live":
                raise ValueError("mock artifacts cannot be used live")
            if profile.jev_model_id != self.jev_model_id:
                raise ValueError("Jev ID differs from frozen profile")
            for configured, frozen in [
                (self.small_model_id, profile.small_model_id),
                (self.large_model_id, profile.large_model_id),
            ]:
                if configured and configured != frozen:
                    raise ValueError("answer model ID differs from frozen profile")
            if any(
                not v or v.startswith("mock/") or "<" in v
                for v in [
                    profile.small_model_id,
                    profile.large_model_id,
                    profile.jev_model_id,
                ]
            ):
                raise ValueError("live model IDs must be configured")
        if profile.rubric_hash != RUBRIC_HASH:
            raise ValueError("profile rubric hash differs from packaged rubric")
        return profile, policy

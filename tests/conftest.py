import json
from pathlib import Path

import pytest

from backend.coaching.config import Settings
from backend.coaching.profiles import Policy, mock_profile
from backend.coaching.schemas import ClassifyRequest


@pytest.fixture
def request_data():
    return json.loads(Path("tests/fixtures/extension-request.json").read_text())


@pytest.fixture
def req(request_data):
    return ClassifyRequest.model_validate(request_data)


@pytest.fixture
def profile():
    return mock_profile()


@pytest.fixture
def policy(profile):
    return Policy(
        version="test-provisional",
        status="provisional",
        threshold=0.9,
        profile_fingerprint=profile.fingerprint,
    )


@pytest.fixture
def settings(tmp_path):
    return Settings(database_url="sqlite:///" + str(tmp_path / "api.db"))

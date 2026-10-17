from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from backend.coaching.profiles import Policy, mock_profile
from backend.main import create_app


@pytest.fixture
def client(settings):
    with TestClient(create_app(settings)) as c:
        yield c


def pair(client):
    code = client.app.state.repository.issue_pairing()
    response = client.post("/coaching/pair", json={"code": code})
    assert response.status_code == 200
    return {"Authorization": "Bearer " + response.json()["session_token"]}


def test_auth_health_and_private_storage(client, request_data):
    assert client.get("/health").json() == {
        "status": "ok",
        "mode": "mock",
        "coaching_mode": "shadow",
    }
    assert client.post("/classify", json=request_data).status_code == 401
    headers = pair(client)
    response = client.post("/classify", json=request_data, headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert (
        body["action"] == "abstain"
        and body["mode"] == "mock"
        and body["classification"] == "small_ok"
    )
    assert body["estimated_savings"] is None and "probabilities" not in body
    rows = client.app.state.repository.db.execute(
        "SELECT * FROM coaching_decisions"
    ).fetchall()
    assert request_data["prompt_text"] not in str([dict(r) for r in rows])
    assert client.get("/evals/summary", headers=headers).json() == {"status": "not_run"}


def test_pairing_is_one_use(client):
    code = client.app.state.repository.issue_pairing()
    assert client.post("/coaching/pair", json={"code": code}).status_code == 200
    assert client.post("/coaching/pair", json={"code": code}).status_code == 401


def test_limits_and_safe_validation(client, request_data):
    headers = pair(client)
    assert (
        client.post("/classify", content=b"x" * 65537, headers=headers).status_code
        == 413
    )
    request_data["prompt_text"] = "private phrase " * 1000
    response = client.post("/classify", json=request_data, headers=headers)
    assert response.status_code == 422 and "private phrase" not in response.text


def test_event_ownership_dedup_and_clear(client, request_data):
    alice, bob = pair(client), pair(client)
    decision = client.post("/classify", json=request_data, headers=alice).json()
    event = {
        "event_id": str(uuid4()),
        "decision_id": decision["decision_id"],
        "draft_revision": 1,
        "event_type": "sent_anyway",
    }
    assert client.post("/coaching/events", json=event, headers=bob).status_code == 404
    assert (
        client.post("/coaching/events", json=event, headers=alice).json()["status"]
        == "recorded"
    )
    assert (
        client.post("/coaching/events", json=event, headers=alice).json()["status"]
        == "duplicate"
    )
    event["event_type"] = "late_result"
    assert client.post("/coaching/events", json=event, headers=alice).status_code == 409
    assert client.delete("/coaching/history", headers=bob).status_code == 200
    assert (
        client.app.state.repository.db.execute(
            "SELECT count(*) FROM coaching_decisions"
        ).fetchone()[0]
        == 1
    )
    client.delete("/coaching/history", headers=alice)
    assert (
        client.app.state.repository.db.execute(
            "SELECT count(*) FROM coaching_events"
        ).fetchone()[0]
        == 0
    )


def test_confirmed_switch_requires_order_and_matching_labels(
    settings, request_data, tmp_path
):
    profile = mock_profile()
    policy = Policy(
        version="provisional-demo",
        status="provisional",
        threshold=0.9,
        profile_fingerprint=profile.fingerprint,
    )
    path = tmp_path / "policy.json"
    path.write_text(policy.model_dump_json())
    settings = settings.model_copy(
        update={"coaching_mode": "suggest", "policy_path": str(path)}
    )
    with TestClient(create_app(settings)) as client:
        headers = pair(client)
        decision = client.post("/classify", json=request_data, headers=headers).json()

        def event(kind, **fields):
            return client.post(
                "/coaching/events",
                headers=headers,
                json={
                    "event_id": str(uuid4()),
                    "decision_id": decision["decision_id"],
                    "draft_revision": 1,
                    "event_type": kind,
                    **fields,
                },
            )

        assert event("sent_with_target").status_code == 409
        assert event("shown").status_code == 200
        assert event("switch_clicked").status_code == 200
        assert (
            event(
                "switch_confirmed", source_label="Mock Large", target_label="wrong"
            ).status_code
            == 409
        )
        assert (
            event(
                "switch_confirmed", source_label="Mock Large", target_label="Mock Small"
            ).status_code
            == 200
        )
        assert (
            event(
                "sent_with_target", source_label="Mock Large", target_label="Mock Small"
            ).status_code
            == 200
        )
        assert (
            event(
                "sent_with_target", source_label="Mock Large", target_label="Mock Small"
            ).status_code
            == 409
        )

from evals.parser_eval import run_attempts, score_parser


def test_missing_extra_duplicate_and_unknown():
    reference = [
        {
            "source_exchange_id": "1",
            "ts": "2026-10-17T12:00:00Z",
            "provider": "chatgpt",
            "model": None,
            "regenerated": False,
        },
        {"source_exchange_id": "2", "provider": "chatgpt"},
    ]
    actual = [
        {
            "source_exchange_id": "1",
            "ts": "2026-10-17T08:00:00-04:00",
            "provider": "chatgpt",
            "regenerated": False,
        },
        {"source_exchange_id": "extra"},
        {"source_exchange_id": "extra"},
    ]
    stats = score_parser(reference, actual)
    assert stats["missing"] == 1 and stats["extra"] == 2 and stats["duplicates"] == 1
    assert stats["exchange_precision"]["value"] == 1 / 3
    assert stats["exchange_recall"]["value"] == 0.5
    assert stats["fields"]["model"]["agreement"]["value"] is None
    assert stats["fields"]["ts"]["agreement"]["value"] == 1
    assert stats["fields"]["provider"]["agreement"]["denominator"] == 2


def test_schema_invalid_and_ambiguous_duplicates():
    stats = score_parser(
        [{"source_exchange_id": "1", "provider": "chatgpt"}],
        [
            {"source_exchange_id": "1", "provider": "chatgpt"},
            {"source_exchange_id": "1", "provider": "chatgpt"},
            {"ts": "bad"},
        ],
    )
    assert stats["schema_invalid"] == 1 and stats["duplicates"] == 1
    assert stats["fields"]["provider"]["agreement"]["numerator"] == 0


def test_five_independent_attempts_and_cached_provenance():
    calls = []

    def runner(**kwargs):
        calls.append(kwargs)
        return {
            "attempt_id": kwargs["attempt_id"],
            "parser_hash": "hash",
            "cache_used": len(calls) == 3,
            "success_first_attempt": True,
            "repair_iterations": 0,
            "records": [],
        }

    result = run_attempts("source", [], runner)
    assert result["fresh_attempts"] == 4 and result["cached_attempts"] == 1
    assert len({c["attempt_id"] for c in calls}) == 5
    assert all(c["disable_parser_cache"] for c in calls)
    assert run_attempts(None, None, None)["status"] == "not_run"

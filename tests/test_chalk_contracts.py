import argparse
import importlib
import json
import sys
import types

from evals.data import load_dataset
from evals.run_chalk import execute, read_results


def test_import_entrypoint_has_no_deployment(monkeypatch):
    class Forbidden:
        def __getattr__(self, name):
            raise AssertionError(name)

    monkeypatch.setitem(sys.modules, "chalkcompute", Forbidden())
    importlib.reload(importlib.import_module("evals.run_chalk"))


def test_deployment_packaging_and_no_dataset_side_effects(monkeypatch):
    calls = []

    class Image:
        @classmethod
        def debian_slim(cls, *args):
            return cls()

        def pip_install(self, deps):
            calls.append(("dependencies", deps))
            return self

        def add_local_python_source(self, *modules):
            calls.append(("sources", modules))
            return self

        def add_local_file(self, *args, **kw):
            calls.append(("file", args))
            return self

    def function(**kwargs):
        calls.append(("function", kwargs))
        return lambda fn: fn

    fake = types.SimpleNamespace(
        Image=Image, function=function, EvaluationScorerResult=lambda **kw: kw
    )
    monkeypatch.setitem(sys.modules, "chalkcompute", fake)
    monkeypatch.setenv("PROMPTPRINT_MODE", "mock")
    sys.modules.pop("evals.chalk_functions", None)
    module = importlib.import_module("evals.chalk_functions")
    assert ("sources", ("backend", "evals")) in calls
    assert all(call[1]["retries"] == 0 for call in calls if call[0] == "function")
    assert module.schema_success("invalid", None) == 0
    sys.modules.pop("evals.chalk_functions", None)


def test_remote_row_errors_and_missing_rows():
    rows = load_dataset("evals/datasets/smoke.jsonl")[:2]
    table = types.SimpleNamespace(
        to_pylist=lambda: [
            {
                "task_id": rows[0].task_id,
                "output": None,
                "output_error": "private upstream error",
                "counts_error": "private",
            }
        ]
    )
    result = read_results(table, rows)
    assert result[0]["error"] == "chalk_task_error" and result[0]["scorer_errors"] == [
        "counts_error"
    ]
    assert result[1]["error"] == "missing_chalk_row"
    assert "private" not in json.dumps(result)


def test_mock_sdk_upload_run_lifecycle(tmp_path, monkeypatch):
    monkeypatch.setenv("PROMPTPRINT_MODE", "mock")
    calls = []
    rows = load_dataset("evals/datasets/smoke.jsonl")[:5]

    class Dataset:
        def upload(self, name, data):
            calls.append("upload")
            assert set(data[0]) == {"task_id", "request_json", "small_adequate"}
            return "revision-1"

        def read(self, revision):
            calls.append("read")
            assert revision == "results"
            return types.SimpleNamespace(
                to_pylist=lambda: [
                    {"task_id": r.task_id, "output": None, "output_error": "failure"}
                    for r in rows
                ]
            )

    class Run:
        id = "run-1"
        result_dataset = "results"

        def wait(self, **kwargs):
            calls.append("wait")
            return self

    class Evaluation:
        @staticmethod
        def create(name, **kwargs):
            calls.append("create")
            assert kwargs["task"] == "task"
            return types.SimpleNamespace(id="evaluation-1", run=lambda **kw: Run())

    fake = types.SimpleNamespace(DatasetClient=Dataset, Evaluation=Evaluation)
    args = argparse.Namespace(
        dataset="evals/datasets/smoke.jsonl",
        split="dev",
        max_calls=5,
        max_input_tokens=100000,
        output=str(tmp_path / "report.json"),
        provider_version_tag="",
        resume_run=None,
        timeout=1,
    )
    report = execute(
        args,
        sdk=fake,
        definitions=types.SimpleNamespace(classifier="task", SCORERS=["counts"]),
    )
    assert calls == ["upload", "create", "wait", "read"]
    assert report.source_mode == "mock" and report.chalk_run_id == "run-1"
    assert (
        report.metrics.counts["V"] == 0
        and report.metrics.errors["chalk_task_error"] == 5
    )


def test_malformed_remote_json_values_remain_row_failures():
    rows = load_dataset("evals/datasets/smoke.jsonl")[:3]
    table = types.SimpleNamespace(
        to_pylist=lambda: [
            {"task_id": row.task_id, "output": output}
            for row, output in zip(rows, ["[1,2]", '"prose"', '{"unexpected":true}'])
        ]
    )
    result = read_results(table, rows)
    assert all(
        r["error"] == "invalid_task_output" and r["output"] is None for r in result
    )

"""Explicit deployment/upload/run boundary; import and --help are offline."""

import argparse
import json
import os
from pathlib import Path

from backend.coaching.config import Settings
from backend.coaching.rubric import payload_for
from backend.coaching.schemas import Decision

from .data import load_dataset, revision, write_json
from .run_local import build_report, code_revision


def read_results(table, rows):
    originals = {r.task_id: r for r in rows}
    records = []
    seen = set()
    for result in table.to_pylist():
        task_id = result["task_id"]
        if task_id not in originals or task_id in seen:
            raise ValueError("unknown or duplicate remote task")
        seen.add(task_id)
        row = originals[task_id]
        try:
            output = (
                json.loads(result["output"])
                if isinstance(result.get("output"), str)
                else result.get("output")
            )
        except (ValueError, TypeError):
            output = None
        try:
            output = Decision.model_validate(output).model_dump(mode="json")
            invalid_output = False
        except (ValueError, TypeError):
            output = None
            invalid_output = True
        if result.get("output_error"):
            output = None
        records.append(
            {
                "task_id": task_id,
                "group_id": row.group_id,
                "family": row.family,
                "split": row.split,
                "reference": row.reference.model_dump(),
                "output": output,
                "error": (
                    "chalk_task_error"
                    if result.get("output_error")
                    else "invalid_task_output" if invalid_output else None
                ),
                "scorer_errors": [
                    key
                    for key, value in result.items()
                    if key.endswith("_error") and key != "output_error" and value
                ],
            }
        )
    for task_id, row in originals.items():
        if task_id not in seen:
            records.append(
                {
                    "task_id": task_id,
                    "group_id": row.group_id,
                    "family": row.family,
                    "split": row.split,
                    "reference": row.reference.model_dump(),
                    "output": None,
                    "error": "missing_chalk_row",
                }
            )
    return records


def execute(args, sdk=None, definitions=None):
    settings = Settings.from_env()
    profile, policy = settings.artifacts()
    rows = load_dataset(args.dataset)
    selected = [r for r in rows if r.split == args.split]
    if not selected:
        raise ValueError("empty partition")
    if any(r.consent == "private" for r in selected):
        raise ValueError("upload consent required")
    if settings.mode == "live" and any(
        r.reference.source == "mock" or r.reference.origin_mode == "mock"
        for r in selected
    ):
        raise ValueError("mock references cannot be live evidence")
    if settings.mode == "live" and not args.provider_version_tag:
        raise ValueError("provider version tag required")
    if len(selected) > args.max_calls:
        raise ValueError("remote call cap exceeded before deployment")
    reservation = sum(
        len(json.dumps(payload_for(r.request, profile), ensure_ascii=False).encode())
        + 1024
        for r in selected
    )
    if reservation > args.max_input_tokens:
        raise ValueError("remote input reservation cap exceeded")
    if os.getenv("EVAL_MAX_COST_USD"):
        raise ValueError("verified prices unavailable; dollar cap cannot be enforced")
    if sdk is None:
        import chalkcompute as sdk
    manifest_path = Path(args.output + ".run.json")
    frozen = {
        "dataset_revision": revision(rows),
        "profile": profile.fingerprint,
        "policy": policy.model_dump(),
        "mode": settings.mode,
        "split": args.split,
        "provider_version_tag": args.provider_version_tag,
        "code_revision": code_revision(),
    }
    if args.resume_run:
        existing = json.loads(manifest_path.read_text())
        if existing["frozen"] != frozen or existing["run_id"] != args.resume_run:
            raise ValueError("resume configuration differs from submitted run")
        run = sdk.EvaluationRun.from_id(args.resume_run)
        evaluation_id = existing["evaluation_id"]
        dataset_revision = existing["chalk_dataset_revision"]
    else:
        if manifest_path.exists():
            raise ValueError(
                "run artifact already exists; resume it or choose a new output"
            )
        if definitions is None:
            from . import chalk_functions as definitions
        client = sdk.DatasetClient()
        dataset = client.upload(
            "prompt-print-" + revision(rows)[:16] + "-" + args.split,
            [
                {
                    "task_id": r.task_id,
                    "request_json": r.request.model_dump_json(),
                    "small_adequate": r.reference.small_adequate,
                }
                for r in selected
            ],
        )
        dataset_revision = getattr(dataset, "revision_id", None) or str(dataset)
        evaluation = sdk.Evaluation.create(
            "prompt-print-" + policy.version,
            dataset=dataset,
            task=definitions.classifier,
            scorers=definitions.SCORERS,
            metadata=frozen,
        )
        run = evaluation.run(
            metadata={"code_revision": frozen["code_revision"], "mode": settings.mode}
        )
        evaluation_id = str(evaluation.id)
        write_json(
            manifest_path,
            {
                "frozen": frozen,
                "evaluation_id": evaluation_id,
                "run_id": str(run.id),
                "chalk_dataset_revision": dataset_revision,
                "status": "submitted",
            },
        )
    try:
        run.wait(timeout=args.timeout, raise_on_failure=True)
    except Exception as exc:
        # Persist lifecycle status; raw SDK messages may contain private row data.
        write_json(
            args.output + ".status.json",
            {
                "run_id": str(run.id),
                "error_type": type(exc).__name__,
                "resume_required": True,
            },
        )
        raise RuntimeError(
            "Chalk run incomplete; inspect status artifact and resume by ID"
        ) from None
    table = sdk.DatasetClient().read(run.result_dataset)
    records = read_results(table, selected)
    report = build_report(
        records,
        settings,
        revision(rows),
        args.split,
        chalk_run_status="SUCCEEDED",
        chalk_evaluation_id=evaluation_id,
        chalk_run_id=str(run.id),
        chalk_dataset_revision=dataset_revision,
    )
    write_json(args.output + ".rows.json", {"manifest": frozen, "records": records})
    write_json(args.output, report.model_dump(mode="json"))
    return report


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--execute",
        action="store_true",
        required=True,
        help="Authorize deployment, dataset upload and billed remote execution",
    )
    p.add_argument("--dataset", required=True)
    p.add_argument("--split", choices=["dev", "test"], required=True)
    p.add_argument("--output", default="artifacts/chalk-report.json")
    p.add_argument("--provider-version-tag", default="")
    p.add_argument("--resume-run")
    p.add_argument("--timeout", type=float, default=600)
    p.add_argument(
        "--max-calls", type=int, default=int(os.getenv("EVAL_MAX_CALLS", "100"))
    )
    p.add_argument(
        "--max-input-tokens",
        type=int,
        default=int(os.getenv("EVAL_MAX_INPUT_TOKENS", "100000")),
    )
    args = p.parse_args()
    report = execute(args)
    print(
        json.dumps(
            {
                "run_id": report.chalk_run_id,
                "mode": report.source_mode,
                "report": args.output,
            }
        )
    )


if __name__ == "__main__":
    main()

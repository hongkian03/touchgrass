"""Export reproducible review selections or apply explicit human label overrides."""

import argparse
import json
import random
from pathlib import Path

from .data import load_dataset, revision, write_dataset, write_json


def export_review(rows, output, random_count=20, targeted_ids=(), seed=0):
    rng = random.Random(seed)
    random_ids = {r.task_id for r in rng.sample(rows, min(random_count, len(rows)))}
    selected = (
        random_ids
        | set(targeted_ids)
        | {r.task_id for r in rows if r.reference.judge_disagreement}
    )
    write_json(
        output,
        {
            "dataset_revision": revision(rows),
            "reviews": [
                {
                    "task_id": r.task_id,
                    "review_kind": "random" if r.task_id in random_ids else "targeted",
                    "small_adequate": r.reference.small_adequate,
                    "large_adequate": r.reference.large_adequate,
                    "reviewer_id": "",
                    "reason": "",
                    "confirmed": False,
                }
                for r in rows
                if r.task_id in selected
            ],
        },
    )


def apply_review(rows, review):
    if review["dataset_revision"] != revision(rows):
        raise ValueError("review revision mismatch")
    by_id = {r.task_id: r for r in rows}
    seen = set()
    for item in review["reviews"]:
        if item["task_id"] in seen or item["task_id"] not in by_id:
            raise ValueError("duplicate or unknown review task")
        seen.add(item["task_id"])
        if not item.get("confirmed"):
            continue
        if (
            not item.get("reviewer_id", "").strip()
            or not item.get("reason", "").strip()
        ):
            raise ValueError("confirmed review needs reviewer and reason")
        row = by_id[item["task_id"]]
        reference = row.reference.model_dump()
        reference.update(
            source="human",
            previous_small_adequate=row.reference.small_adequate,
            small_adequate=item["small_adequate"],
            large_adequate=item["large_adequate"],
            review_kind=item["review_kind"],
            reviewer_id=item["reviewer_id"],
            review_reason=item["reason"],
        )
        from .data import Reference

        by_id[row.task_id] = row.model_copy(
            update={"reference": Reference.model_validate(reference)}
        )
    return list(by_id.values())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    export = sub.add_parser("export")
    export.add_argument("--dataset", required=True)
    export.add_argument("--output", required=True)
    export.add_argument("--random-count", type=int, default=20)
    export.add_argument("--target-id", action="append", default=[])
    apply = sub.add_parser("apply")
    apply.add_argument("--dataset", required=True)
    apply.add_argument("--reviews", required=True)
    apply.add_argument("--output", required=True)
    args = parser.parse_args()
    rows = load_dataset(args.dataset)
    if args.command == "export":
        export_review(rows, args.output, args.random_count, args.target_id)
    else:
        write_dataset(
            args.output, apply_review(rows, json.loads(Path(args.reviews).read_text()))
        )


if __name__ == "__main__":
    main()

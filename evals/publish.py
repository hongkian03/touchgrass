"""Explicitly publish an inspected, sanitized report to the local API database."""

import argparse
from pathlib import Path

from backend.coaching.config import Settings
from backend.coaching.repository import Repository
from backend.reports.schemas import Report

from .metrics import upper_bound


def validate_publication(report):
    if report.source_mode == "mock" and report.evidence_status != "mock_only":
        raise ValueError("mock report cannot claim live evidence")
    if report.source_mode == "live" and (
        any(x.startswith("mock/") for x in report.model_ids + report.resolved_model_ids)
        or report.evidence_status == "mock_only"
    ):
        raise ValueError("inconsistent live report")
    if report.chalk_run_status not in ("not_run", "SUCCEEDED"):
        raise ValueError(
            "failed/incomplete Chalk runs cannot be published as completed"
        )
    for value in [report.metrics, *report.slices.values()]:
        c = value.counts
        if set(c) != {"N", "V", "R", "S_all", "S", "H", "A", "M"} or any(
            v < 0 for v in c.values()
        ):
            raise ValueError("invalid raw metric counts")
        if not (
            c["R"] <= c["V"] <= c["N"]
            and c["H"] <= c["S"] <= c["R"]
            and c["S"] <= c["S_all"] <= c["V"]
            and c["M"] <= c["A"] <= c["R"]
            and c["A"] == c["M"] + c["S"] - c["H"]
        ):
            raise ValueError("raw counts do not reconcile")
        if c["N"] + sum(value.ineligible_inputs.values()) != value.attempted_inputs:
            raise ValueError("eligible counts do not reconcile")
        if not 0 <= value.actual_suggestions <= c["S_all"]:
            raise ValueError("actual suggestions exceed candidate count")
        expected_bound = (
            upper_bound(c["H"], c["S"]) if value.independent_groups else None
        )
        if value.harmful_rate_upper_95 != expected_bound:
            raise ValueError("inconsistent confidence bound")
        expected_ratios = {
            "execution_success": (c["V"], c["N"]),
            "operational_candidate_coverage": (c["S_all"], c["N"]),
            "labeled_candidate_coverage": (c["S"], c["R"]),
            "harmful_recommendation_rate": (c["H"], c["S"]),
            "harmful_fraction": (c["H"], c["R"]),
            "missed_opportunity_rate": (c["M"], c["A"]),
        }
        for name, counts in expected_ratios.items():
            rate = value.ratios[name]
            if (rate.numerator, rate.denominator) != counts:
                raise ValueError("ratio denominator differs from raw counts")
        for rate in value.ratios.values():
            expected = rate.numerator / rate.denominator if rate.denominator else None
            if rate.value != expected:
                raise ValueError("inconsistent ratio")
    if any(
        sum(s.counts[key] for s in report.slices.values()) != value
        for key, value in report.metrics.counts.items()
    ):
        raise ValueError("family slices do not reconcile")
    if report.evidence_status == "interval_support" and (
        report.split != "test"
        or report.metrics.harmful_rate_upper_95 is None
        or report.metrics.harmful_rate_upper_95 > report.harmful_rate_target
    ):
        raise ValueError("interval support requires qualifying held-out evidence")
    return report


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--report", required=True)
    p.add_argument(
        "--inspected",
        action="store_true",
        required=True,
        help="Confirm that you inspected the report and its provenance",
    )
    args = p.parse_args()
    report = validate_publication(
        Report.model_validate_json(Path(args.report).read_text())
    )
    settings = Settings.from_env()
    repo = Repository(settings.db_path, "publication-only", settings.retention_days)
    try:
        repo.publish(report)
    finally:
        repo.close()
    print(f"Published {report.source_mode} report for {report.split}")


if __name__ == "__main__":
    main()

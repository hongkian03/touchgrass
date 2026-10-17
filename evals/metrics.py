import math
from collections import Counter

from backend.coaching.schemas import Decision

from .scorers import score


def ratio(numerator, denominator):
    return {
        "numerator": numerator,
        "denominator": denominator,
        "value": numerator / denominator if denominator else None,
    }


def upper_bound(failures, trials, confidence=0.95):
    """One-sided Clopper-Pearson bound, using a stable binomial CDF inversion."""
    if not 0 <= failures <= trials or not 0 < confidence < 1:
        raise ValueError("invalid binomial counts/confidence")
    if trials == 0:
        return None
    if failures == trials:
        return 1.0
    if failures == 0:
        return -math.expm1(math.log1p(-confidence) / trials)

    def cdf(p):
        logs = [
            math.lgamma(trials + 1)
            - math.lgamma(k + 1)
            - math.lgamma(trials - k + 1)
            + k * math.log(p)
            + (trials - k) * math.log1p(-p)
            for k in range(failures + 1)
        ]
        peak = max(logs)
        return math.exp(peak) * sum(math.exp(x - peak) for x in logs)

    lo, hi = failures / trials, 1.0
    for _ in range(70):
        mid = (lo + hi) / 2
        if mid == 1:
            break
        if cdf(mid) > 1 - confidence:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def percentile(values, q):
    if not values:
        return None
    ordered = sorted(values)
    pos = (len(ordered) - 1) * q
    low = int(pos)
    return ordered[low] + (ordered[min(low + 1, len(ordered) - 1)] - ordered[low]) * (
        pos - low
    )


def metrics(records):
    attempted_inputs = len(records)
    ineligible_reasons = {
        "not_opted_in",
        "empty_prompt",
        "unsupported_capability",
        "context_truncated",
        "context_unavailable",
        "unsupported_profile",
        "unsupported_model",
        "target_unavailable",
        "mock_fixture_in_live",
    }
    excluded = Counter()
    eligible = []
    for record in records:
        try:
            decision = Decision.model_validate(record.get("output"))
        except (ValueError, TypeError):
            decision = None
        if decision and decision.response.reason_code in ineligible_reasons:
            excluded[decision.response.reason_code] += 1
        else:
            eligible.append(record)
    records = eligible
    groups = {r.get("group_id", f"row-{index}") for index, r in enumerate(records)}
    independent = len(groups) == len(records)
    totals = Counter(N=len(records), V=0, R=0, S_all=0, S=0, H=0, A=0, M=0)
    errors = Counter()
    latencies = []
    agreement = denominator = abstentions = uncertain = unresolved = disagreements = (
        both_fail
    ) = 0
    reference_resolved_attempted = failed_with_reference = actual_suggestions = 0
    reviews = {
        "random": {"reviewed": 0, "agreement": 0, "comparable": 0},
        "targeted": {"reviewed": 0, "agreement": 0, "comparable": 0},
    }
    for record in records:
        reference = record["reference"]
        truth = reference["small_adequate"]
        s = score(record.get("output"), truth)
        totals.update(
            V=s["valid"],
            R=s["resolved"],
            S_all=s["candidate_recommendation"],
            S=int(bool(s["candidate_recommendation"] and s["resolved"])),
            H=s["harmful"],
            A=s["adequate"],
            M=s["missed"],
        )
        reference_resolved_attempted += truth is not None
        failed_with_reference += truth is not None and not s["valid"]
        unresolved += truth is None
        disagreements += reference.get("judge_disagreement", False)
        both_fail += truth is False and reference.get("large_adequate") is False
        kind = reference.get("review_kind", "none")
        if reference.get("source") == "human" and kind in reviews:
            review = reviews[kind]
            review["reviewed"] += 1
            prior = reference.get("previous_small_adequate")
            if truth is not None and prior is not None:
                review["comparable"] += 1
                review["agreement"] += prior == truth
        agreement += s["binary_agreement"]
        denominator += s["binary_denominator"]
        if record.get("error"):
            errors[record["error"]] += 1
        if record.get("scorer_errors"):
            errors["scorer_error"] += len(record["scorer_errors"])
        try:
            decision = Decision.model_validate(record.get("output"))
            abstentions += decision.response.action == "abstain"
            actual_suggestions += decision.response.action == "suggest_small"
            uncertain += decision.response.classification == "uncertain"
            latencies.append(decision.response.elapsed_ms)
            if decision.prediction is None:
                errors[decision.response.reason_code] += 1
        except (ValueError, TypeError):
            errors["invalid_task_output"] += 1
    t = totals
    return {
        "attempted_inputs": attempted_inputs,
        "ineligible_inputs": dict(excluded),
        "independent_group_count": len(groups),
        "independent_groups": independent,
        "actual_suggestions": actual_suggestions,
        "counts": dict(t),
        "ratios": {
            "execution_success": ratio(t["V"], t["N"]),
            "operational_candidate_coverage": ratio(t["S_all"], t["N"]),
            "labeled_candidate_coverage": ratio(t["S"], t["R"]),
            "harmful_recommendation_rate": ratio(t["H"], t["S"]),
            "harmful_fraction": ratio(t["H"], t["R"]),
            "missed_opportunity_rate": ratio(t["M"], t["A"]),
            "raw_binary_agreement_valid_resolved_non_uncertain": ratio(
                agreement, denominator
            ),
        },
        "harmful_rate_upper_95": upper_bound(t["H"], t["S"]) if independent else None,
        "abstentions": abstentions,
        "uncertain_predictions": uncertain,
        "unresolved_references": unresolved,
        "reference_resolved_attempted": reference_resolved_attempted,
        "failed_with_reference": failed_with_reference,
        "judge_disagreements": disagreements,
        "both_answers_fail": both_fail,
        "errors": dict(errors),
        "latency_ms": {
            "p50": percentile(latencies, 0.5),
            "p95": percentile(latencies, 0.95),
        },
        "human_review": reviews,
    }

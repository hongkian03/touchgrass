from backend.coaching.schemas import Decision


def score(output, small_adequate):
    try:
        decision = (
            Decision.model_validate_json(output)
            if isinstance(output, str)
            else Decision.model_validate(output)
        )
    except (ValueError, TypeError):
        return {
            "schema_success": 0,
            "valid": 0,
            "resolved": 0,
            "candidate_recommendation": 0,
            "harmful": 0,
            "missed": 0,
            "adequate": 0,
            "binary_agreement": 0,
            "binary_denominator": 0,
        }
    valid = decision.prediction is not None
    resolved = valid and small_adequate is not None
    suggestion = valid and decision.candidate_action == "suggest_small"
    binary = resolved and decision.prediction.label in ("small_ok", "needs_big")
    return {
        "schema_success": 1,
        "valid": int(valid),
        "resolved": int(resolved),
        "candidate_recommendation": int(suggestion),
        "harmful": int(suggestion and resolved and small_adequate is False),
        "missed": int(resolved and small_adequate is True and not suggestion),
        "adequate": int(resolved and small_adequate is True),
        "binary_agreement": int(
            binary and (decision.prediction.label == "small_ok") == small_adequate
        ),
        "binary_denominator": int(binary),
    }

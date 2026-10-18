def choose(
    prediction,
    profile,
    policy,
    mode,
    coaching_mode,
    *,
    require_website_equivalence=True,
):
    if prediction is None:
        return "abstain", "abstain", "invalid_output"
    if (
        profile.expected_jev_resolved_model
        and prediction.resolved_model != profile.expected_jev_resolved_model
    ):
        return "abstain", "abstain", "model_version_mismatch"
    if prediction.label == "uncertain":
        return "abstain", "abstain", "uncertain"
    if prediction.label == "needs_big":
        candidate, reason = "keep_current", "needs_big"
    elif profile.fingerprint != policy.profile_fingerprint:
        return "abstain", "abstain", "policy_mismatch"
    elif prediction.probabilities["small_ok"] < policy.threshold:
        return "abstain", "abstain", "below_threshold"
    else:
        candidate, reason = "suggest_small", "threshold_met"
    if coaching_mode == "shadow" or policy.status == "shadow":
        return "abstain", candidate, "shadow_policy"
    if mode == "live" and policy.source_mode != "live":
        return "abstain", candidate, "policy_mode_mismatch"
    if mode == "live" and not profile.expected_jev_resolved_model:
        return "abstain", candidate, "model_version_unpinned"
    if (
        mode == "live"
        and require_website_equivalence
        and not profile.website_equivalence_verified
    ):
        return "abstain", candidate, "website_equivalence_unknown"
    return candidate, candidate, reason

"""Chalk online @features + windowed aggregations for live chat-to-redirect coaching.

Tracks user prompt sessions, cross-site redirect accept/stay events, and rolling
energy/CO2 savings across 1h, 1d, and 7d windows so the Model Gateway + JEV
router adapts to each user's live routing behavior.
"""

from datetime import datetime
from typing import TYPE_CHECKING

try:
    from chalk import Windowed, online, windowed
    from chalk.features import DataFrame, Primary, _, feature, features
    import chalk.functions as F
except ImportError:  # Local fallback when chalkpy is not installed in thin test envs
    pass
else:

    @features(owner="coaching@touchgrass.ai", tags=["group:coaching", "stage:live"])
    class PromptRouteEvent:
        id: Primary[str]
        user_id: "UserRoutingSession.id"
        site: str
        target_platform: str
        small_ok_prob: float
        jev_confidence: float
        accepted_hop: bool
        saved_wh: float
        saved_co2_g: float
        context_turns_carried: int
        created_at: datetime

    @features(owner="coaching@touchgrass.ai", tags=["group:coaching", "stage:live"])
    class UserRoutingSession:
        id: Primary[str]
        active_site: str
        events: "DataFrame[PromptRouteEvent]"

        # Native Chalk expressions (compiled to C++/Rust for sub-ms online serving)
        total_prompts: int = _.events.count()
        total_hops: int = _.events[_.accepted_hop == True].count()  # noqa: E712
        total_saved_wh: float = _.events[_.saved_wh].sum()
        total_saved_co2_g: float = _.events[_.saved_co2_g].sum()

        # Windowed aggregations using _.chalk_window
        prompts_window: Windowed[int] = windowed(
            "1h",
            "1d",
            "7d",
            expression=_.events[
                _.created_at > _.chalk_window,
                _.created_at < _.chalk_now,
            ].count(),
            default=0,
        )

        saved_wh_window: Windowed[float] = windowed(
            "1h",
            "1d",
            "7d",
            expression=_.events[
                _.saved_wh,
                _.created_at > _.chalk_window,
                _.created_at < _.chalk_now,
            ].sum(),
            default=0.0,
        )

        hop_accept_rate_7d: float = feature(max_staleness="5m", default=0.85)

    @online
    def compute_hop_accept_rate(
        total_prompts: UserRoutingSession.total_prompts,
        total_hops: UserRoutingSession.total_hops,
    ) -> UserRoutingSession.hop_accept_rate_7d:
        if total_prompts <= 0:
            return 0.85
        return round(total_hops / total_prompts, 3)

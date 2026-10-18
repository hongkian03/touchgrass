"""Boundary for the footprint owner. No model coefficients are assumed."""

from typing import Protocol

from pydantic import Field, model_validator

from .schemas import Contract


class Estimate(Contract):
    low: float = Field(allow_inf_nan=False)
    high: float = Field(allow_inf_nan=False)
    unit: str
    basis: str
    assumptions: list[str]
    version: str

    @model_validator(mode="after")
    def ordered(self):
        if self.low > self.high:
            raise ValueError("invalid interval")
        return self


class FootprintEstimator(Protocol):
    def estimate_exchange(
        self, model_id, tokens, modality, region_assumption
    ) -> Estimate | None: ...


def net_saving(
    baseline: Estimate | None, alternative: Estimate | None, overhead: Estimate | None
):
    if any(x is None for x in [baseline, alternative, overhead]):
        return None
    if len({x.unit for x in [baseline, alternative, overhead]}) != 1:
        raise ValueError("incompatible units")
    return Estimate(
        low=baseline.low - alternative.high - overhead.high,
        high=baseline.high - alternative.low - overhead.low,
        unit=baseline.unit,
        basis="modeled counterfactual including classification overhead",
        assumptions=sum([x.assumptions for x in [baseline, alternative, overhead]], []),
        version=";".join(x.version for x in [baseline, alternative, overhead]),
    )

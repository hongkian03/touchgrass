from backend.coaching.rubric import RUBRIC_HASH
from backend.coaching.schemas import Prediction

# Identifiers refer only to versioned synthetic fixtures, never prompt keywords.
MOCK_LABELS = {
    "smoke-0": "small_ok",
    "smoke-1": "needs_big",
    "smoke-2": "uncertain",
    "smoke-3": "small_ok",
    "smoke-4": "needs_big",
    "smoke-5": "small_ok",
    "smoke-6": "needs_big",
    "smoke-7": "small_ok",
    "smoke-8": "uncertain",
    "smoke-9": "small_ok",
}


class MockClassifier:
    async def predict(self, request, profile):
        label = MOCK_LABELS.get(request.mock_fixture_id, "uncertain")
        return Prediction(
            label=label,
            probabilities={
                k: 0.94 if k == label else 0.03
                for k in ["small_ok", "needs_big", "uncertain"]
            },
            confidence=0.91,
            requested_model="mock/jev",
            resolved_model="mock/jev-v1",
            rubric_hash=RUBRIC_HASH,
            elapsed_ms=0,
        )

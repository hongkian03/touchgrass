from typing import Protocol

from backend.coaching.profiles import CoachingProfile, Generation
from backend.coaching.schemas import ClassifyRequest, Prediction

from .chalk_gateway import Answer


class ClassifierClient(Protocol):
    async def predict(
        self, request: ClassifyRequest, profile: CoachingProfile
    ) -> Prediction: ...


class AnswerClient(Protocol):
    async def chat(
        self, model: str, messages: list[dict], generation: Generation
    ) -> Answer: ...

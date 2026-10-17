"""The only classifier task, shared by local and Chalk runners."""

from backend.coaching.schemas import ClassifyRequest


async def classify_task(service, request_json):
    request = ClassifyRequest.model_validate_json(request_json)
    return (await service.classify(request)).model_dump(mode="json")

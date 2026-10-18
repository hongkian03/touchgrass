import time

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import Field

from .schemas import ClassifyRequest, ClassifyResponse, CoachingEvent, Contract
from .service import Saturated

router = APIRouter()


def owner(request: Request):
    authorization = request.headers.get("authorization", "")
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "authentication_required")
    try:
        return request.app.state.repository.owner(authorization[7:])
    except PermissionError:
        raise HTTPException(401, "invalid_session") from None


class PairingRequest(Contract):
    code: str = Field(min_length=20, max_length=100)


@router.post("/coaching/pair")
async def pair(body: PairingRequest, request: Request):
    try:
        return {"session_token": request.app.state.repository.pair(body.code)}
    except PermissionError:
        raise HTTPException(401, "invalid_pairing") from None


@router.post("/coaching/auto-pair")
async def auto_pair(request: Request):
    """Extension mints a session on startup — no pasted code for the demo."""
    return {"session_token": request.app.state.repository.auto_pair()}


@router.post("/classify", response_model=ClassifyResponse)
async def classify(body: ClassifyRequest, request: Request, session=Depends(owner)):
    try:
        decision = await request.app.state.classifier.classify(
            body, request.scope.get("started", time.monotonic())
        )
    except Saturated:
        raise HTTPException(429, "saturated") from None
    request.app.state.repository.save_decision(session, body, decision)
    return decision.response


@router.post("/coaching/events")
async def events(body: CoachingEvent, request: Request, session=Depends(owner)):
    try:
        return {"status": request.app.state.repository.event(session, body)}
    except PermissionError:
        raise HTTPException(404, "decision_not_found") from None
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from None


@router.get("/coaching/targets")
async def targets(request: Request, session=Depends(owner)):
    config = getattr(request.app.state.classifier, "config", None)
    return {
        "generalized": config is not None,
        "targets": [
            {"site": p.site, "model_id": p.target_model_id,
             "website_label": p.target_label, "aliases": p.target_aliases}
            for p in config.providers
        ] if config else [],
    }


@router.delete("/coaching/history")
async def clear(request: Request, session=Depends(owner)):
    request.app.state.repository.clear(session)
    return {"status": "cleared"}


@router.get("/coaching/insights")
async def coaching_insights(request: Request, session=Depends(owner)):
    """Aggregate classify/event history for popup Insights (no prompts)."""
    return request.app.state.repository.owner_insights(session)

from fastapi import APIRouter, Depends, Request

from backend.coaching.router import owner

router = APIRouter()


@router.get("/evals/summary")
async def summary(request: Request, session=Depends(owner)):
    return request.app.state.repository.summary()

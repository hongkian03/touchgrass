"""Loopback demo API. Importing this module performs no network calls."""

import asyncio
import secrets
import time
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.coaching.config import Settings
from backend.coaching.repository import Repository
from backend.coaching.router import router as coaching_router
from backend.coaching.service import ClassifierService
from backend.integrations.chalk_gateway import Gateway
from backend.integrations.mock_models import MockClassifier
from backend.reports.router import router as reports_router


class RequestBoundary:
    def __init__(self, app, limit=65536, classify_deadline_ms=700):
        self.app, self.limit = app, limit
        self.classify_deadline_ms = classify_deadline_ms

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        scope["started"] = time.monotonic()
        # Buffer a bounded body before validation; covers chunked requests too.
        body = bytearray()
        more = True
        body_budget = (
            self.classify_deadline_ms / 1000 if scope["path"] == "/classify" else 5
        )
        try:
            async with asyncio.timeout(body_budget):
                while more:
                    message = await receive()
                    if message["type"] == "http.disconnect":
                        return
                    chunk = message.get("body", b"")
                    if len(body) + len(chunk) > self.limit:
                        return await JSONResponse({"detail": "payload_too_large"}, 413)(
                            scope, receive, send
                        )
                    body.extend(chunk)
                    more = message.get("more_body", False)
        except TimeoutError:
            return await JSONResponse({"detail": "request_body_timeout"}, 408)(
                scope, receive, send
            )
        consumed = False

        async def replay():
            nonlocal consumed
            if consumed:
                return await receive()
            consumed = True
            return {"type": "http.request", "body": bytes(body), "more_body": False}

        await self.app(scope, replay, send)


def create_app(settings=None, classifier_client=None):
    settings = settings or Settings.from_env()
    profile, policy = settings.artifacts()

    @asynccontextmanager
    async def lifespan(app):
        key = settings.session_secret.get_secret_value() or secrets.token_urlsafe(32)
        repository = Repository(settings.db_path, key, settings.retention_days)
        async with httpx.AsyncClient(
            follow_redirects=False,
            trust_env=False,
            limits=httpx.Limits(max_connections=settings.max_concurrency),
        ) as http:
            client = classifier_client or (
                MockClassifier() if settings.mode == "mock" else Gateway(http, settings)
            )
            app.state.repository = repository
            app.state.classifier = ClassifierService(settings, profile, policy, client)
            try:
                yield
            finally:
                repository.close()

    app = FastAPI(title="Prompt Print coaching", version="1.0.0", lifespan=lifespan)
    app.add_middleware(RequestBoundary, classify_deadline_ms=settings.deadline_ms)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_methods=["GET", "POST", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
    )

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc):
        # FastAPI's default error contains input values, potentially private text.
        return JSONResponse(
            {
                "detail": [
                    {"loc": list(e["loc"]), "type": e["type"]} for e in exc.errors()
                ]
            },
            422,
        )

    @app.get("/health")
    async def health():
        return {
            "status": "ok",
            "mode": settings.mode,
            "coaching_mode": settings.coaching_mode,
        }

    app.include_router(coaching_router)
    app.include_router(reports_router)
    return app


# Use uvicorn backend.main:create_app --factory; no startup on import.

# syntax=docker/dockerfile:1
FROM python:3.12-slim-bookworm

COPY --from=ghcr.io/astral-sh/uv:0.9.7 /uv /uvx /usr/local/bin/

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_PYTHON_DOWNLOADS=0 \
    UV_NO_SYNC=1 \
    PATH="/app/.venv/bin:$PATH" \
    PROMPTPRINT_DATA_DIR=/data \
    FACTORY_DROID_AUTO_UPDATE_ENABLED=false

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl git xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Pin the CLI and verify the release checksum. No Factory credentials are used at build time.
ARG DROID_VERSION=0.174.0
RUN set -eu; \
    case "$(dpkg --print-architecture)" in \
      amd64) arch=x64 ;; \
      arm64) arch=arm64 ;; \
      *) exit 1 ;; \
    esac; \
    base_url="https://downloads.factory.ai/factory-cli/releases/${DROID_VERSION}/linux/${arch}"; \
    mkdir -p /tmp/droid-install; \
    cd /tmp/droid-install; \
    curl --fail --silent --show-error --location --retry 3 "$base_url/droid" -o droid; \
    curl --fail --silent --show-error --location --retry 3 "$base_url/droid.sha256" -o droid.sha256; \
    awk '{print $1 "  droid"}' droid.sha256 | sha256sum --check; \
    install -m 0755 droid /usr/local/bin/droid; \
    cd /; \
    rm -rf /tmp/droid-install; \
    droid --version

WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-dev --no-install-project

# .dockerignore limits this context to runtime code and nonsecret configuration.
COPY . .
RUN mkdir -p /data \
    && python -c "import numpy, PIL, pandas, jsonschema, bs4, tiktoken, multipart, pytest; import sandbox_jobs.droid_runner; import backend.sandbox"

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD python -c "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:' + os.environ.get('PORT', '8000') + '/health', timeout=4)"

# No startup network sweep: run cleanup_sandboxes separately when needed.
CMD ["sh", "-c", "exec python start.py --host 0.0.0.0 --port \"${PORT:-8000}\" --no-sweep"]

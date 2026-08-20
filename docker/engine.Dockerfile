FROM python:3.12-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/usr/local

RUN apt-get update \
 && apt-get install -y --no-install-recommends build-essential curl \
 && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:0.5.11 /uv /usr/local/bin/uv

WORKDIR /app

# Bağımlılıklar önce — kod değişince katman yeniden kurulmaz.
COPY pyproject.toml uv.lock* ./
RUN uv sync --frozen --no-install-project --no-dev 2>/dev/null \
 || uv sync --no-install-project --no-dev

COPY . .
RUN uv sync --no-dev 2>/dev/null || true

ENV PYTHONPATH=/app

EXPOSE 8000

CMD ["uvicorn", "sarnic.api.main:app", "--host", "0.0.0.0", "--port", "8000"]

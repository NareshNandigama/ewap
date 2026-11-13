FROM python:3.12-slim AS builder
WORKDIR /build
COPY requirements.lock ./
RUN python -m pip wheel --no-cache-dir --wheel-dir /wheels -r requirements.lock
COPY pyproject.toml README.md MANIFEST.in ./
COPY src ./src
RUN python -m pip wheel --no-cache-dir --no-deps --wheel-dir /wheels .

FROM python:3.12-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app
COPY --from=builder /wheels /wheels
RUN python -m pip install --no-cache-dir --no-index --find-links=/wheels ewap-ai-service==0.1.0 \
    && rm -rf /wheels
USER 10001:10001
EXPOSE 8001
HEALTHCHECK --interval=5s --timeout=3s --start-period=10s --retries=5 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8001/health', timeout=2).close()"]
CMD ["python", "-m", "uvicorn", "ewap_ai.main:app", "--host", "0.0.0.0", "--port", "8001", "--no-access-log"]

import asyncio

import pytest
from fastapi.testclient import TestClient

from ewap_ai.body_limit import DiagnosticBodyLimit, MAX_REQUEST_BYTES
from ewap_ai.main import create_app

ENDPOINT = "/v1/diagnostics/workflow-run"


@pytest.mark.parametrize("key", [None, "wrong-key", "é" * 32])
def test_missing_or_invalid_key_is_rejected(client, payload, key):
    client.headers.pop("X-EWAP-Service-Key", None)
    headers = {} if key is None else {"X-EWAP-Service-Key": key}
    # HTTPX restricts string header values to ASCII; bytes exercise UTF-8 safely.
    headers = {name: value.encode("utf-8") for name, value in headers.items()}
    response = client.post(ENDPOINT, json=payload, headers=headers)
    assert response.status_code == 401
    assert "wrong-key" not in response.text


def test_missing_configuration_fails_closed_but_health_works(monkeypatch, payload):
    monkeypatch.delenv("AI_SERVICE_API_KEY", raising=False)
    with TestClient(create_app()) as client:
        assert client.get("/health").status_code == 200
        assert client.post(ENDPOINT, json=payload).status_code == 503


@pytest.mark.parametrize("key", ["", "short", "k" * 513, "x" * 32 + " ", "é" * 32])
def test_invalid_service_configuration_rejected_at_startup(monkeypatch, key):
    monkeypatch.setenv("AI_SERVICE_API_KEY", key)
    with pytest.raises(ValueError, match="AI_SERVICE_API_KEY"):
        create_app()


def test_body_size_limit(client):
    response = client.post(ENDPOINT, content=b"x" * (MAX_REQUEST_BYTES + 1))
    assert response.status_code == 413


def test_chunked_size_limit_before_parsing():
    called = False

    async def app(scope, receive, send):
        nonlocal called
        called = True

    chunks = iter([
        {"type": "http.request", "body": b"x" * MAX_REQUEST_BYTES, "more_body": True},
        {"type": "http.request", "body": b"x", "more_body": False},
    ])
    sent = []

    async def receive():
        return next(chunks)

    async def send(message):
        sent.append(message)

    asyncio.run(DiagnosticBodyLimit(app)({
        "type": "http", "path": ENDPOINT,
    }, receive, send))
    assert not called
    assert sent[0]["status"] == 413

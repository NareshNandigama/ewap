import pytest
from fastapi.testclient import TestClient

from ewap_ai.main import create_app


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("AI_SERVICE_API_KEY", "test-service-key-" + "a" * 32)
    with TestClient(create_app()) as test_client:
        test_client.headers["X-EWAP-Service-Key"] = "test-service-key-" + "a" * 32
        yield test_client


@pytest.fixture
def payload():
    return {
        "organizationId": "org-1",
        "question": "Why did this fail?",
        "workflowRun": {
            "id": "run-1",
            "status": "FAILED",
            "logs": [{
                "id": "log-1",
                "level": "ERROR",
                "message": "Connection timed out",
                "createdAt": "2026-11-12T10:00:00Z",
            }],
        },
    }

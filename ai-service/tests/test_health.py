def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {
        "status": "ok", "service": "ewap-ai-service", "analysisMode": "deterministic"
    }


def test_openapi_exposes_versioned_contract(client):
    schema = client.get("/openapi.json").json()
    assert "/v1/diagnostics/workflow-run" in schema["paths"]
    assert "organizationId" in schema["components"]["schemas"]["DiagnosticRequest"]["properties"]

import asyncio
import json
import logging
from pathlib import Path

import httpx
import pytest
from pydantic import ValidationError
from fastapi.testclient import TestClient
from ewap_ai.main import create_app
from ewap_ai.evaluate import evaluate, make_request
from ewap_ai.model_diagnostics import ModelDiagnostics, ModelSettings
from ewap_ai.grounding import supported
from ewap_ai.schemas import DiagnosticRequest

CASES = json.loads((Path(__file__).parents[1] / 'evaluations/grounding-cases.json').read_text())

@pytest.mark.parametrize('split', ['development', 'heldout'])
def test_frozen_split_contract_evaluation(split):
    selected = [case for case in CASES if case['split'] == split]
    result = asyncio.run(evaluate(selected))
    assert result['passed'] == result['total'] == 6
    assert all(row.get('rootCauseUndetermined') for row in result['cases'])
    assert len({case['id'] for case in CASES}) == len(CASES)


def test_grounding_http_contract_and_provider_boundaries(monkeypatch, caplog):
    monkeypatch.setenv('AI_SERVICE_API_KEY', 'a' * 32)
    caplog.set_level(logging.INFO, logger='uvicorn.error.diagnostics')
    case = CASES[0]
    def handler(request):
        body = json.loads(request.content)
        prompt = json.loads(body['messages'][1]['content'])
        assert prompt['runbooks'][0]['version'] == 1
        assert 'untrusted' in body['messages'][0]['content']
        assert body['response_format']['json_schema']['schema']['additionalProperties'] is False
        assert 'organizationId' not in prompt
        return httpx.Response(200, json={'choices':[{'finish_reason':'stop','message':{'content':json.dumps({'observations':case['candidateObservations']})}}], 'usage':{'prompt_tokens':100,'completion_tokens':40}})
    engine = ModelDiagnostics(ModelSettings(mode='llm', model='mock', api_key='test'), httpx.MockTransport(handler))
    with TestClient(create_app(engine)) as client:
        response = client.post('/v1/diagnostics/workflow-run', headers={'X-EWAP-Service-Key':'a'*32}, json=make_request(case).model_dump(mode='json', exclude_none=True))
        assert response.status_code == 200
        report = response.json()
        assert report['grounding']['status'] == 'supported_observations'
        assert report['grounding']['passages'][0]['version'] == 1
        assert report['findings'] == []
        assert report['rootCause']['status'] == 'undetermined'
    events = [
        json.loads(record.message)
        for record in caplog.records
        if record.name == 'uvicorn.error.diagnostics'
    ]
    assert len(events) == 1
    event = events[0]
    assert event.pop('durationMs') >= 0
    assert event == {
        'event': 'workflow_diagnostics',
        'mode': 'llm',
        'outcome': 'completed',
        'groundingStatus': 'supported_observations',
        'inputTokens': 100,
        'outputTokens': 40,
    }


def test_deterministic_mode_abstains_with_context(monkeypatch):
    monkeypatch.setenv('AI_SERVICE_API_KEY', 'a' * 32)
    with TestClient(create_app()) as client:
        report = client.post('/v1/diagnostics/workflow-run', headers={'X-EWAP-Service-Key':'a'*32}, json=make_request(CASES[0]).model_dump(mode='json', exclude_none=True)).json()
        assert report['analysisMode'] == 'deterministic'
        assert report['grounding']['status'] == 'insufficient_evidence'
        assert 'usage' not in report


def test_passage_hash_and_duplicate_validation():
    request = make_request(CASES[0]).model_dump(mode='json', exclude_none=True)
    request['grounding']['passages'][0]['content'] = 'Changed source text'
    with pytest.raises(ValidationError): DiagnosticRequest.model_validate(request)
    request = make_request(CASES[0]).model_dump(mode='json', exclude_none=True)
    request['grounding']['passages'] *= 2
    with pytest.raises(ValidationError): DiagnosticRequest.model_validate(request)


def test_empty_evidence_skips_provider_and_usage():
    def handler(_):
        pytest.fail('No provider work is allowed without sources/logs')
    engine = ModelDiagnostics(ModelSettings(mode='llm', model='mock', api_key='test'), httpx.MockTransport(handler))
    report = asyncio.run(engine.run(make_request(CASES[1])))
    assert report.grounding.status == 'insufficient_evidence'
    assert report.usage is None

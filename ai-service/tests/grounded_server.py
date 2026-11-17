"""Loopback-only cross-process fixture: real graph/HTTP, explicitly mocked model."""
import json
import socket
import httpx
import uvicorn
from ewap_ai.main import create_app
from ewap_ai.model_diagnostics import ModelDiagnostics, ModelSettings


def handler(request):
    prompt = json.loads(json.loads(request.content)['messages'][1]['content'])
    log, passage = prompt['logs'][0], prompt['runbooks'][0]
    observations = [{ 'claim': log['message'], 'log_id': log['id'], 'log_quote': log['message'],
                      'passage_id': passage['chunkId'], 'passage_quote': passage['content'] }]
    return httpx.Response(200, json={'choices':[{'finish_reason':'stop','message':{'content':json.dumps({'observations':observations})}}],
                                  'usage':{'prompt_tokens':100,'completion_tokens':40}})


if __name__ == '__main__':
    engine = ModelDiagnostics(ModelSettings(mode='llm', model='mock-only', api_key='mock-only'), httpx.MockTransport(handler))
    sock = socket.socket()
    sock.bind(('127.0.0.1', 0))
    print(json.dumps({'url': f'http://127.0.0.1:{sock.getsockname()[1]}'}), flush=True)
    uvicorn.Server(uvicorn.Config(create_app(engine), log_level='error', access_log=False)).run(sockets=[sock])

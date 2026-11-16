import base64
import io
import json
import asyncio
from PIL import Image
import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from backend.app import create_app
from backend.classifier import classify
from backend.models import AnalysisResult

@pytest.fixture
def photo():
    buffer = io.BytesIO()
    Image.new('RGB', (40, 30), '#87978a').save(buffer, 'PNG')
    return 'data:image/png;base64,' + base64.b64encode(buffer.getvalue()).decode()

@pytest.fixture
def payload(photo):
    return {'image': photo, 'address': 'Rua de teste, 123', 'area': 'Bairro teste', 'lat': -23.55, 'lng': -46.63,
            'category': 'dano', 'description': 'Piso quebrado', 'userDescription': 'Observação de teste.'}

@pytest.fixture
def client(tmp_path):
    with TestClient(create_app(tmp_path, api_key='')) as client:
        yield client

def test_persistence_review_conflict_and_atomic_delete(tmp_path, payload):
    first = TestClient(create_app(tmp_path, api_key=''))
    assert first.get('/api/records').json() == []
    response = first.post('/api/records', json=payload)
    assert response.status_code == 201, response.text
    record = response.json()
    assert record['status'] == 'pendente'
    assert record['classificationMethod'] == 'manual'
    assert record['suggestedCategory'] == 'inconclusiva'
    photo = first.get(record['image'])
    assert photo.headers['content-type'] == 'image/jpeg'
    assert Image.open(io.BytesIO(photo.content)).size == (40, 30)
    second = TestClient(create_app(tmp_path, api_key=''))
    assert second.get('/api/records').json()[0]['id'] == record['id']
    change = {'category': 'dano', 'description': 'Revisão do piso', 'status': 'validado', 'version': 1}
    url = '/api/records/' + record['id']
    updated = second.patch(url, json=change)
    assert updated.status_code == 200, updated.text
    assert updated.json()['version'] == 2
    assert updated.json()['history'][-1]['previous']['description'] == 'Piso quebrado'
    assert second.patch(url, json=change).status_code == 409
    assert second.delete(url + '?version=1').status_code == 409
    assert second.delete(url + '?version=2').status_code == 204
    assert second.get(record['image']).status_code == 404
    assert second.get('/api/records').json() == []

def test_validation_and_no_auto_validation(client, payload):
    for patch in [{'lat': 91}, {'address': '  '}, {'category': 'inventada'}, {'status': 'validado'}, {'image': 'data:image/png;base64,aGVsbG8='}, {'image': 'https://example.com/image.jpg'}]:
        assert client.post('/api/records', json={**payload, **patch}).status_code == 422
    r = client.post('/api/records', json={**payload, 'category': 'inconclusiva'}).json()
    assert client.patch('/api/records/' + r['id'], json={'category': 'inconclusiva', 'description': 'Sem evidências', 'status': 'validado', 'version': 1}).status_code == 422

def test_unconfigured_analysis_is_not_simulated(client, photo):
    assert client.get('/api/health').json()['analysisConfigured'] is False
    assert client.post('/api/analyze', json={'image': photo, 'consent': True}).status_code == 503
    assert client.post('/api/analyze', json={'image': photo}).status_code == 422

def test_local_origin_and_private_files(client, payload):
    assert client.post('/api/records', json=payload, headers={'Origin': 'https://outside.example'}).status_code == 403
    assert client.post('/api/records', content='{}', headers={'Content-Type': 'text/plain'}).status_code == 415
    assert client.get('/api/health', headers={'Host': 'outside.example'}).status_code == 400
    for path in ['/.env', '/data/vialivre.sqlite3', '/backend/app.py']:
        assert client.get(path).status_code == 404
    assert 'mode:"local"' in client.get('/runtime.js').text

def test_analysis_binds_result_to_photo(client, payload, photo, monkeypatch):
    async def stub(*args):
        return AnalysisResult(category='obstrucao', description='Objeto na faixa de circulação.')
    monkeypatch.setattr('backend.classifier.classify', stub)
    result = client.post('/api/analyze', json={'image': photo, 'consent': True}).json()
    created = client.post('/api/records', json={**payload, 'analysisId': result['analysisId']}).json()
    assert created['suggestedCategory'] == 'obstrucao'
    assert created['analysis']['description'] == 'Objeto na faixa de circulação.'
    assert created['category'] == 'dano'
    assert created['status'] == 'pendente'
    assert client.post('/api/records', json={**payload, 'analysisId': 'forged'}).status_code == 422
    buffer = io.BytesIO()
    Image.new('RGB', (50, 50), 'red').save(buffer, 'PNG')
    other = 'data:image/png;base64,' + base64.b64encode(buffer.getvalue()).decode()
    assert client.post('/api/records', json={**payload, 'image': other, 'analysisId': result['analysisId']}).status_code == 422

@pytest.mark.parametrize('code,body,expected', [
    (200, {'status': 'completed', 'steps': [{'type': 'thought', 'content': []}, {'type': 'model_output', 'content': [{'type': 'text', 'text': '{"category":"dano","description":"Piso danificado."}'}]}]}, None),
    (200, {'status': 'completed', 'outputs': [{'type': 'text', 'text': '{"category":"dano","description":"Piso danificado."}'}]}, None),
    (200, {'status': 'completed', 'outputs': [{'type': 'text', 'text': '{"category":"invalid","description":"erro"}'}]}, 502),
    (200, {'status': 'in_progress'}, 502), (403, {}, 503), (429, {}, 503), (500, {}, 502),
])
def test_provider_contract(code, body, expected):
    def handler(request):
        assert request.headers['x-goog-api-key'] == 'unit-test-only'
        sent = json.loads(request.content)
        assert sent['store'] is False
        assert sent['input'][1]['type'] == 'image'
        return httpx.Response(code, json=body)
    task = classify(b'fixture-bytes', 'unit-test-only', 'configured-model', httpx.MockTransport(handler))
    if expected:
        with pytest.raises(HTTPException) as exc:
            asyncio.run(task)
        assert exc.value.status_code == expected
    else:
        assert asyncio.run(task).category == 'dano'

def test_rejection_and_reopening(client, payload):
    record = client.post('/api/records', json=payload).json()
    url = '/api/records/' + record['id']
    for version, status in enumerate(['rejeitado', 'pendente', 'validado'], start=1):
        response = client.patch(url, json={'category': 'dano', 'description': 'Revisão funcional', 'status': status, 'version': version})
        assert response.status_code == 200
        assert response.json()['status'] == status
        assert response.json()['reviewedBy'] == (None if status == 'pendente' else 'Revisor local')


def test_provider_timeout_and_invalid_json():
    def timeout(request):
        raise httpx.ReadTimeout('timeout', request=request)
    with pytest.raises(HTTPException) as exc:
        asyncio.run(classify(b'fixture', 'unit-test-only', 'model', httpx.MockTransport(timeout)))
    assert exc.value.status_code == 504
    def invalid(request):
        return httpx.Response(200, content=b'not json')
    with pytest.raises(HTTPException) as exc:
        asyncio.run(classify(b'fixture', 'unit-test-only', 'model', httpx.MockTransport(invalid)))
    assert exc.value.status_code == 502


def test_map_requests_can_identify_the_page_origin(client):
    response = client.get('/')
    assert response.status_code == 200
    assert response.headers['referrer-policy'] == 'strict-origin-when-cross-origin'

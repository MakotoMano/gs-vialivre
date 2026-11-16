import base64
import io
import pytest
from PIL import Image
from fastapi.testclient import TestClient
from backend.app import create_app
from backend.database import Database
from backend.models import AnalysisResult

@pytest.fixture
def online_app(tmp_path, monkeypatch):
    monkeypatch.setenv('ADMIN_USERNAME', 'revisor')
    monkeypatch.setenv('ADMIN_PASSWORD', 'senha-de-teste-revisor')
    monkeypatch.setenv('REGISTRATION_CODE', 'convite-de-teste')
    monkeypatch.setenv('ONLINE_ANALYSIS_ENABLED', 'true')
    monkeypatch.setenv('FREE_TIER_CONFIRMED', 'true')
    return create_app(api_key='unit-test-only', online=True, database_override=Database(tmp_path/'online.sqlite3'))

@pytest.fixture
def clients(online_app):
    return [TestClient(online_app, base_url='https://testserver') for _ in range(3)]

@pytest.fixture
def payload():
    buffer=io.BytesIO()
    Image.new('RGB',(40,30),'green').save(buffer,'PNG')
    return {'image':'data:image/png;base64,'+base64.b64encode(buffer.getvalue()).decode(),
            'address':'Rua de teste','area':'Bairro de teste','lat':-23.5,'lng':-46.6,
            'category':'dano','description':'Piso danificado','userDescription':'Observação privada'}

def register(client, username='cidadao'):
    return client.post('/api/auth/register',json={'username':username,'password':'senha-de-teste-cidadao','inviteCode':'convite-de-teste'})

def reviewer(client):
    response=client.post('/api/auth/login',json={'username':'revisor','password':'senha-de-teste-revisor'})
    assert response.status_code==200,response.text
    return response

def test_online_permissions_and_private_records(clients,payload):
    owner, public, admin=clients
    assert public.post('/api/records',json=payload).status_code==401
    assert public.post('/api/analyze',json={'image':payload['image'],'consent':True}).status_code==401
    assert register(owner).status_code==201
    record=owner.post('/api/records',json=payload).json()
    assert record['status']=='pendente'
    assert len(owner.get('/api/records').json())==1
    assert public.get('/api/records').json()==[]
    assert public.get(record['image']).status_code==404
    assert owner.get(record['image']).status_code==200
    url='/api/records/'+record['id']
    review={'category':'dano','description':'Barreira confirmada','status':'validado','version':1}
    assert owner.patch(url,json=review).status_code==403
    assert owner.delete(url+'?version=1').status_code==403
    reviewer(admin)
    assert admin.patch(url,json=review).status_code==200
    published=public.get('/api/records').json()[0]
    assert published['status']=='validado'
    assert published['userDescription']==''
    assert published['history']==[]
    assert 'ownerId' not in published and 'analysis' not in published
    assert public.get(record['image']).status_code==200
    assert admin.delete(url+'?version=2').status_code==204
    assert public.get(record['image']).status_code==404

def test_sessions_are_secure_and_revocable(clients):
    user, visitor, _=clients
    response=register(user)
    assert 'Secure' in response.headers['set-cookie'] and 'HttpOnly' in response.headers['set-cookie']
    assert 'SameSite=strict' in response.headers['set-cookie']
    cookie=user.cookies.get('vialivre_session')
    assert user.get('/api/auth/me').json()['user']['role']=='citizen'
    user.post('/api/auth/logout',json={})
    visitor.cookies.set('vialivre_session',cookie)
    assert visitor.get('/api/auth/me').json()['user'] is None
    assert user.get('/api/auth/me').json()['user'] is None

def test_registration_does_not_assign_reviewer(clients):
    user,_,_=clients
    response=user.post('/api/auth/register',json={'username':'teste','password':'senha-de-teste-cidadao','inviteCode':'convite-de-teste','role':'reviewer'})
    assert response.status_code==422
    assert user.post('/api/auth/register',json={'username':'teste','password':'senha-de-teste-cidadao','inviteCode':'errado'}).status_code==403
    assert register(user,'revisor').status_code==409

def test_login_failures_are_limited(clients):
    user,_,_=clients
    for _ in range(8):
        assert user.post('/api/auth/login',json={'username':'revisor','password':'errada'}).status_code==401
    assert user.post('/api/auth/login',json={'username':'revisor','password':'errada'}).status_code==429

def test_online_analysis_limits_and_ownership(clients,payload,monkeypatch):
    owner, other, _=clients
    register(owner)
    register(other,'outro')
    calls=[]
    async def classify(*args):
        calls.append(True)
        return AnalysisResult(category='dano',description='Piso visivelmente danificado.')
    monkeypatch.setattr('backend.classifier.classify',classify)
    for _ in range(5):
        response=owner.post('/api/analyze',json={'image':payload['image'],'consent':True})
        assert response.status_code==200
    assert owner.post('/api/analyze',json={'image':payload['image'],'consent':True}).status_code==429
    assert len(calls)==5
    assert other.post('/api/records',json={**payload,'analysisId':response.json()['analysisId']}).status_code==403

def test_online_requires_confirmed_free_tier(tmp_path,monkeypatch,payload):
    monkeypatch.setenv('ADMIN_PASSWORD','senha-de-teste-revisor')
    monkeypatch.setenv('ONLINE_ANALYSIS_ENABLED','true')
    monkeypatch.delenv('FREE_TIER_CONFIRMED',raising=False)
    app=create_app(api_key='unit-test-only',online=True,database_override=Database(tmp_path/'free.sqlite3'))
    client=TestClient(app,base_url='https://testserver')
    reviewer(client)
    assert client.get('/api/health').json()['analysisConfigured'] is False
    assert client.post('/api/analyze',json={'image':payload['image'],'consent':True}).status_code==503

def test_online_rejects_local_database(monkeypatch):
    monkeypatch.delenv('DATABASE_URL',raising=False)
    with pytest.raises(RuntimeError,match='PostgreSQL persistente'):
        create_app(online=True,api_key='')

def test_no_public_api_docs_or_cross_origin_login(clients):
    user,_,_=clients
    assert user.get('/api/docs').status_code==404
    assert user.get('/api/openapi.json').status_code==404
    assert user.post('/api/auth/login',json={'username':'revisor','password':'senha-de-teste-revisor'},headers={'Origin':'https://another.example'}).status_code==403

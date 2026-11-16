import hashlib
import json
import os
import secrets
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from starlette.middleware.trustedhost import TrustedHostMiddleware
from . import auth, classifier
from .database import Database, DATABASE_ERRORS
from .images import normalize_image
from .models import ROOT, ImageInput, RecordInput, ReviewInput, LoginInput, RegisterInput


def now():
    return datetime.now(timezone.utc).isoformat()


def create_app(data_dir=None, api_key=None, model=None, *, online=None, database_override=None):
    load_dotenv(ROOT / '.env', override=False)
    online = os.getenv('VIALIVRE_MODE', 'local') == 'online' if online is None else online
    key = os.getenv('GEMINI_API_KEY', '') if api_key is None else api_key
    selected_model = model or os.getenv('GEMINI_MODEL', 'gemini-4-hydrogen')
    if online and not (os.getenv('ONLINE_ANALYSIS_ENABLED') == 'true' and os.getenv('FREE_TIER_CONFIRMED') == 'true'):
        key = ''
    invite_code = os.getenv('REGISTRATION_CODE', '')
    if online and not database_override:
        target = os.getenv('DATABASE_URL', '')
        if not target.startswith(('postgres://', 'postgresql://')):
            raise RuntimeError('A versão online exige DATABASE_URL de um PostgreSQL persistente.')
    else:
        target = Path(data_dir or os.getenv('VIALIVRE_DATA_DIR', ROOT / 'data')) / 'vialivre.sqlite3'
    database = database_override or Database(target)
    if online:
        auth.bootstrap_reviewer(database, os.getenv('ADMIN_USERNAME', 'revisor'), os.getenv('ADMIN_PASSWORD', ''))
    dummy_hash = auth.password_hash(secrets.token_urlsafe(20)) if online else ''
    hosts = ['127.0.0.1', 'localhost', '[::1]', 'testserver']
    hosts += [h.strip() for h in os.getenv('ALLOWED_HOSTS', '').split(',') if h.strip() and h.strip() != '*']
    if os.getenv('RENDER_EXTERNAL_HOSTNAME'):
        hosts.append(os.environ['RENDER_EXTERNAL_HOSTNAME'])

    @asynccontextmanager
    async def lifespan(app):
        yield
        database.close()

    app = FastAPI(title='ViaLivre — API', version='3.0.0', lifespan=lifespan,
                  docs_url=None if online else '/api/docs',
                  openapi_url=None if online else '/api/openapi.json', redoc_url=None)
    app.state.database = database
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=hosts)

    def user_for(request):
        return auth.session_user(database, request) if online else {'id': 'local', 'username': 'Revisor local', 'role': 'reviewer'}

    def require_user(request, reviewer=False):
        user = user_for(request)
        if not user:
            raise HTTPException(401, 'Entre na sua conta para continuar.')
        if reviewer and user['role'] != 'reviewer':
            raise HTTPException(403, 'Somente o revisor pode realizar esta operação.')
        return user

    def visible(record, user):
        return record['status'] == 'validado' or bool(user and (user['role'] == 'reviewer' or record.get('ownerId') == user['id']))

    def safe_record(record, user):
        if not online or user and (user['role'] == 'reviewer' or record.get('ownerId') == user['id']):
            return record
        result = {k: v for k, v in record.items() if k not in ('ownerId', 'analysis')}
        result.update(userDescription='', history=[], reviewedBy='Equipe de revisão')
        return result

    def client_bucket(request):
        # Use the trusted server-side client address, never an arbitrary forwarded header.
        return hashlib.sha256((request.client.host if request.client else 'unknown').encode()).hexdigest()

    def checked_image(value):
        image = normalize_image(value)
        if online and len(image) > 500_000:
            raise HTTPException(413, 'Esta fotografia ficou muito grande. Escolha uma imagem menor para o cadastro online.')
        return image

    @app.middleware('http')
    async def guard(request: Request, call_next):
        if request.url.path.startswith('/api/') and request.method in ('POST', 'PUT', 'PATCH', 'DELETE'):
            origin = request.headers.get('origin')
            if origin and origin != str(request.base_url).rstrip('/'):
                return JSONResponse({'detail': 'Origem da solicitação não permitida.'}, status_code=403)
            if request.method in ('POST', 'PATCH', 'PUT'):
                if request.headers.get('content-type', '').split(';')[0] != 'application/json':
                    return JSONResponse({'detail': 'Envie os dados em formato JSON.'}, status_code=415)
                length, chunks = 0, []
                async for chunk in request.stream():
                    length += len(chunk)
                    if length > 12_000_000:
                        return JSONResponse({'detail': 'Arquivo maior que o limite permitido.'}, status_code=413)
                    chunks.append(chunk)
                request._body = b''.join(chunks)
        try:
            response = await call_next(request)
        except DATABASE_ERRORS:
            return JSONResponse({'detail': 'Não foi possível acessar o banco. Tente novamente mais tarde.'}, status_code=503)
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
        response.headers['Cache-Control'] = 'no-store'
        response.headers['X-Frame-Options'] = 'DENY'
        if online:
            response.headers['Strict-Transport-Security'] = 'max-age=31536000'
        return response

    @app.exception_handler(RequestValidationError)
    async def validation_error(request, exc):
        return JSONResponse({'detail': 'Confira os campos obrigatórios, tamanhos e valores informados.'}, status_code=422)

    @app.get('/runtime.js', include_in_schema=False)
    def runtime():
        mode = 'online' if online else 'local'
        return Response('window.VIALIVRE={mode:"' + mode + '"};', media_type='text/javascript')

    @app.get('/api/health')
    def health():
        with database.connect() as db:
            db.execute('SELECT 1').fetchone()
        return {'status': 'ok', 'mode': 'online' if online else 'local', 'storage': 'postgresql' if database.postgres else 'sqlite',
                'analysisConfigured': bool(key), 'registrationOpen': bool(online and invite_code), 'version': '3.0.0'}

    @app.get('/api/auth/me')
    def me(request: Request):
        return {'user': auth.public_user(user_for(request))}

    @app.post('/api/auth/login')
    def login(payload: LoginInput, request: Request, response: Response):
        if not online:
            raise HTTPException(404, 'Contas estão disponíveis na versão online.')
        username = auth.normalize_username(payload.username)
        database.consume('login-ip', client_bucket(request), 30, 3600)
        database.consume('login-user', username, 8, 300)
        with database.connect() as db:
            user = db.execute('SELECT * FROM users WHERE username=?', (username,)).fetchone()
        verified = auth.verify_password(payload.password, user['password_hash'] if user else dummy_hash)
        if not user or not verified:
            raise HTTPException(401, 'Usuário ou senha incorretos.')
        auth.issue_session(database, user, response)
        return {'user': auth.public_user(user)}

    @app.post('/api/auth/register', status_code=201)
    def register(payload: RegisterInput, request: Request, response: Response):
        if not online or not invite_code:
            raise HTTPException(403, 'O cadastro de colaboradores não está aberto.')
        database.consume('register-ip', client_bucket(request), 5, 3600)
        if not secrets.compare_digest(payload.inviteCode.encode(), invite_code.encode()):
            raise HTTPException(403, 'Código de convite inválido.')
        username = auth.normalize_username(payload.username)
        encoded = auth.password_hash(payload.password)
        user = {'id': secrets.token_hex(16), 'username': username, 'role': 'citizen'}
        with database.connect() as db:
            db.serialize()
            if db.execute('SELECT COUNT(*) AS count FROM users').fetchone()['count'] >= 50:
                raise HTTPException(409, 'O limite de contas desta edição foi atingido.')
            if db.execute('SELECT id FROM users WHERE username=?', (username,)).fetchone():
                raise HTTPException(409, 'Escolha outro nome de usuário.')
            db.execute('INSERT INTO users VALUES (?,?,?,?)', (user['id'], username, encoded, 'citizen'))
        auth.issue_session(database, user, response)
        return {'user': user}

    @app.post('/api/auth/logout')
    def logout(request: Request, response: Response):
        token = request.cookies.get(auth.COOKIE, '')
        if token:
            with database.connect() as db:
                db.execute('DELETE FROM sessions WHERE token_hash=?', (hashlib.sha256(token.encode()).hexdigest(),))
        response.delete_cookie(auth.COOKIE, secure=True, httponly=True, samesite='strict', path='/')
        return {'ok': True}

    @app.get('/api/records')
    def records(request: Request):
        user = user_for(request)
        with database.connect() as db:
            rows = [json.loads(row['data']) for row in db.execute('SELECT data FROM records')]
        return [safe_record(r, user) for r in sorted(rows, key=lambda r: r['date'], reverse=True) if not online or visible(r, user)]

    @app.post('/api/analyze')
    async def analyze(payload: ImageInput, request: Request):
        user = require_user(request)
        if not payload.consent:
            raise HTTPException(422, 'Autorize o envio desta fotografia ao serviço externo ou use a classificação manual.')
        image = checked_image(payload.image)
        if online:
            if not key:
                raise HTTPException(503, 'A classificação externa está desativada. Use o preenchimento manual.')
            database.consume('analysis-user', user['id'], 5)
            database.consume('analysis-global', 'site', 20)
        result = await classifier.classify(image, key, selected_model)
        analysis_id = secrets.token_urlsafe(24)
        stored_result = {**result.model_dump(), 'ownerId': user['id']} if online else result.model_dump()
        with database.connect() as db:
            db.execute('DELETE FROM analyses WHERE created < ?', ((datetime.now(timezone.utc) - timedelta(days=1)).isoformat(),))
            db.execute('INSERT INTO analyses VALUES (?, ?, ?, ?)', (analysis_id, hashlib.sha256(image).hexdigest(), json.dumps(stored_result), now()))
        return {**result.model_dump(), 'analysisId': analysis_id}

    @app.post('/api/records', status_code=201)
    def create_record(payload: RecordInput, request: Request):
        user = require_user(request)
        image = checked_image(payload.image)
        if online:
            database.consume('records-user', user['id'], 10)
        date, record_id = now(), 'VL-' + secrets.token_hex(6).upper()
        suggestion, analysis = 'inconclusiva', None
        with database.connect() as db:
            db.serialize()
            if online:
                sizes = db.execute('SELECT COUNT(*) AS count, COALESCE(SUM(length(image)),0) AS bytes FROM records').fetchone()
                if sizes['count'] >= 500 or sizes['bytes'] + len(image) > 100_000_000:
                    raise HTTPException(409, 'O limite de registros desta edição foi atingido. O revisor deve liberar espaço.')
            if payload.analysisId:
                row = db.execute('SELECT * FROM analyses WHERE id = ?', (payload.analysisId,)).fetchone()
                if not row or row['image_hash'] != hashlib.sha256(image).hexdigest():
                    raise HTTPException(422, 'A classificação não corresponde à fotografia. Reprocesse ou classifique manualmente.')
                analysis = json.loads(row['result'])
                if online and analysis.pop('ownerId', None) != user['id']:
                    raise HTTPException(403, 'Esta classificação pertence a outra conta.')
                suggestion = analysis['category']
            record = {**payload.model_dump(exclude={'image', 'analysisId'}), 'id': record_id,
                      'suggestedCategory': suggestion, 'analysis': analysis,
                      'classificationMethod': 'servico' if analysis else 'manual',
                      'date': date, 'status': 'pendente', 'image': '/api/records/' + record_id + '/image',
                      'illustration': False, 'source': 'usuario', 'reviewedBy': None, 'version': 1,
                      'history': [{'date': date, 'action': 'Ocorrência registrada — classificação ' + ('pelo serviço externo' if analysis else 'manual')},
                                  {'date': date, 'action': 'Enviada para revisão humana'}]}
            if online:
                record['ownerId'] = user['id']
            db.execute('INSERT INTO records VALUES (?, ?, ?, ?)', (record_id, json.dumps(record, ensure_ascii=False), image, 1))
        return record

    @app.get('/api/records/{record_id}/image')
    def photo(record_id: str, request: Request):
        user = user_for(request)
        with database.connect() as db:
            row = db.execute('SELECT image,data FROM records WHERE id=?', (record_id,)).fetchone()
        if not row or online and not visible(json.loads(row['data']), user):
            raise HTTPException(404, 'Fotografia não encontrada.')
        return Response(bytes(row['image']), media_type='image/jpeg')

    @app.patch('/api/records/{record_id}')
    def review(record_id: str, payload: ReviewInput, request: Request):
        user = require_user(request, reviewer=True)
        if payload.status == 'validado' and payload.category == 'inconclusiva':
            raise HTTPException(422, 'Escolha uma categoria conclusiva antes de validar.')
        with database.connect() as db:
            db.serialize()
            row = db.execute('SELECT data, version FROM records WHERE id=?', (record_id,)).fetchone()
            if not row:
                raise HTTPException(404, 'Ocorrência não encontrada.')
            if row['version'] != payload.version:
                raise HTTPException(409, 'Este registro foi alterado em outra janela. Feche os detalhes e atualize a página.')
            record = json.loads(row['data'])
            previous = {k: record[k] for k in ('category', 'description', 'status')}
            record.update(payload.model_dump(exclude={'version'}))
            record['version'] += 1
            record['reviewedBy'] = None if payload.status == 'pendente' else user['username']
            action = {'validado': 'Classificação revisada e validada', 'rejeitado': 'Ocorrência rejeitada após revisão', 'pendente': 'Ocorrência devolvida para revisão'}[payload.status]
            record['history'].append({'date': now(), 'action': action, 'previous': previous})
            if online:
                record['history'] = record['history'][-50:]
            db.execute('UPDATE records SET data=?, version=? WHERE id=?', (json.dumps(record, ensure_ascii=False), record['version'], record_id))
        return record

    @app.delete('/api/records/{record_id}', status_code=204)
    def delete_record(record_id: str, version: int, request: Request):
        require_user(request, reviewer=True)
        with database.connect() as db:
            cursor = db.execute('DELETE FROM records WHERE id=? AND version=?', (record_id, version))
            if not cursor.rowcount:
                raise HTTPException(409, 'Registro alterado ou removido. Atualize a página antes de tentar novamente.')
        return Response(status_code=204)

    app.mount('/', StaticFiles(directory=ROOT / 'dist', html=True), name='interface')
    return app

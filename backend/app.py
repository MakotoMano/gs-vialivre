import hashlib
import json
import os
import secrets
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib.parse import urlparse

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from starlette.middleware.trustedhost import TrustedHostMiddleware

from . import classifier
from .images import normalize_image
from .models import ROOT, ImageInput, RecordInput, ReviewInput


def now():
    return datetime.now(timezone.utc).isoformat()


@contextmanager
def connection(path):
    db = sqlite3.connect(path, timeout=15)
    db.row_factory = sqlite3.Row
    try:
        with db:
            yield db
    finally:
        db.close()


def create_app(data_dir=None, api_key=None, model=None):
    load_dotenv(ROOT / '.env', override=False)
    storage = Path(data_dir or os.getenv('VIALIVRE_DATA_DIR', ROOT / 'data'))
    storage.mkdir(parents=True, exist_ok=True)
    database = storage / 'vialivre.sqlite3'
    key = os.getenv('GEMINI_API_KEY', '') if api_key is None else api_key
    selected_model = model or os.getenv('GEMINI_MODEL', 'gemini-4-hydrogen')
    with connection(database) as db:
        db.execute('PRAGMA journal_mode=WAL')
        db.execute('CREATE TABLE IF NOT EXISTS records (id TEXT PRIMARY KEY, data TEXT NOT NULL, image BLOB NOT NULL, version INTEGER NOT NULL)')
        db.execute('CREATE TABLE IF NOT EXISTS analyses (id TEXT PRIMARY KEY, image_hash TEXT NOT NULL, result TEXT NOT NULL, created TEXT NOT NULL)')
        db.execute('PRAGMA user_version=1')
    app = FastAPI(title='ViaLivre — API local', version='2.0.0', docs_url='/api/docs', openapi_url='/api/openapi.json', redoc_url=None)
    app.state.database = database
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=['127.0.0.1', 'localhost', '[::1]', 'testserver'])

    @app.middleware('http')
    async def local_guard(request: Request, call_next):
        if request.url.path.startswith('/api/') and request.method in ('POST', 'PUT', 'PATCH', 'DELETE'):
            origin = request.headers.get('origin')
            if origin and origin != str(request.base_url).rstrip('/'):
                return JSONResponse({'detail': 'Origem da solicitação não permitida.'}, status_code=403)
            if request.method in ('POST', 'PATCH', 'PUT'):
                if request.headers.get('content-type', '').split(';')[0] != 'application/json':
                    return JSONResponse({'detail': 'Envie os dados em formato JSON.'}, status_code=415)
                length = 0
                chunks = []
                async for chunk in request.stream():
                    length += len(chunk)
                    if length > 12_000_000:
                        return JSONResponse({'detail': 'Arquivo maior que o limite permitido.'}, status_code=413)
                    chunks.append(chunk)
                request._body = b''.join(chunks)
        try:
            response = await call_next(request)
        except sqlite3.Error:
            return JSONResponse({'detail': 'Não foi possível acessar o banco local. Tente novamente.'}, status_code=503)
        response.headers['X-Content-Type-Options'] = 'nosniff'
        # Map tiles require the real page origin; omit the path for external services.
        response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
        response.headers['Cache-Control'] = 'no-store'
        return response

    @app.exception_handler(RequestValidationError)
    async def validation_error(request, exc):
        return JSONResponse({'detail': 'Confira os campos obrigatórios, tamanhos e valores informados.'}, status_code=422)

    @app.get('/runtime.js', include_in_schema=False)
    def runtime():
        return Response('window.VIALIVRE={mode:"local"};', media_type='text/javascript')

    @app.get('/api/health')
    def health():
        with connection(database) as db:
            db.execute('SELECT 1').fetchone()
        return {'status': 'ok', 'mode': 'local', 'storage': 'sqlite', 'analysisConfigured': bool(key), 'version': '2.0.0'}

    @app.get('/api/records')
    def records():
        with connection(database) as db:
            return [json.loads(row['data']) for row in db.execute('SELECT data FROM records ORDER BY rowid DESC')]

    @app.post('/api/analyze')
    async def analyze(payload: ImageInput):
        if not payload.consent:
            raise HTTPException(422, 'Autorize o envio desta fotografia ao serviço externo ou use a classificação manual.')
        image = normalize_image(payload.image)
        result = await classifier.classify(image, key, selected_model)
        analysis_id = secrets.token_urlsafe(24)
        with connection(database) as db:
            db.execute('DELETE FROM analyses WHERE created < ?', ((datetime.now(timezone.utc) - timedelta(days=1)).isoformat(),))
            db.execute('INSERT INTO analyses VALUES (?, ?, ?, ?)', (analysis_id, hashlib.sha256(image).hexdigest(), result.model_dump_json(), now()))
        return {**result.model_dump(), 'analysisId': analysis_id}

    @app.post('/api/records', status_code=201)
    def create_record(payload: RecordInput):
        image = normalize_image(payload.image)
        date = now()
        record_id = 'VL-' + secrets.token_hex(6).upper()
        suggestion = 'inconclusiva'
        analysis = None
        with connection(database) as db:
            if payload.analysisId:
                row = db.execute('SELECT * FROM analyses WHERE id = ?', (payload.analysisId,)).fetchone()
                if not row or row['image_hash'] != hashlib.sha256(image).hexdigest():
                    raise HTTPException(422, 'A classificação não corresponde à fotografia. Reprocesse ou classifique manualmente.')
                analysis = json.loads(row['result'])
                suggestion = analysis['category']
            record = {**payload.model_dump(exclude={'image', 'analysisId'}), 'id': record_id,
                      'suggestedCategory': suggestion, 'analysis': analysis,
                      'classificationMethod': 'servico' if analysis else 'manual',
                      'date': date, 'status': 'pendente', 'image': '/api/records/' + record_id + '/image',
                      'illustration': False, 'source': 'usuario', 'reviewedBy': None, 'version': 1,
                      'history': [{'date': date, 'action': 'Ocorrência registrada — classificação ' + ('pelo serviço externo' if analysis else 'manual')},
                                  {'date': date, 'action': 'Enviada para revisão humana'}]}
            db.execute('INSERT INTO records VALUES (?, ?, ?, ?)', (record_id, json.dumps(record, ensure_ascii=False), image, 1))
        return record

    @app.get('/api/records/{record_id}/image')
    def photo(record_id: str):
        with connection(database) as db:
            row = db.execute('SELECT image FROM records WHERE id=?', (record_id,)).fetchone()
        if not row:
            raise HTTPException(404, 'Fotografia não encontrada.')
        return Response(row['image'], media_type='image/jpeg')

    @app.patch('/api/records/{record_id}')
    def review(record_id: str, payload: ReviewInput):
        if payload.status == 'validado' and payload.category == 'inconclusiva':
            raise HTTPException(422, 'Escolha uma categoria conclusiva antes de validar.')
        with connection(database) as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT data, version FROM records WHERE id=?', (record_id,)).fetchone()
            if not row:
                raise HTTPException(404, 'Ocorrência não encontrada.')
            if row['version'] != payload.version:
                raise HTTPException(409, 'Este registro foi alterado em outra janela. Feche os detalhes e atualize a página.')
            record = json.loads(row['data'])
            previous = {k: record[k] for k in ('category', 'description', 'status')}
            record.update(payload.model_dump(exclude={'version'}))
            record['version'] += 1
            record['reviewedBy'] = None if payload.status == 'pendente' else 'Revisor local'
            action = {'validado': 'Classificação revisada e validada', 'rejeitado': 'Ocorrência rejeitada após revisão', 'pendente': 'Ocorrência devolvida para revisão'}[payload.status]
            record['history'].append({'date': now(), 'action': action, 'previous': previous})
            db.execute('UPDATE records SET data=?, version=? WHERE id=?', (json.dumps(record, ensure_ascii=False), record['version'], record_id))
        return record

    @app.delete('/api/records/{record_id}', status_code=204)
    def delete_record(record_id: str, version: int):
        with connection(database) as db:
            cursor = db.execute('DELETE FROM records WHERE id=? AND version=?', (record_id, version))
            if not cursor.rowcount:
                raise HTTPException(409, 'Registro alterado ou removido. Atualize a página antes de tentar novamente.')
        return Response(status_code=204)

    app.mount('/', StaticFiles(directory=ROOT / 'dist', html=True), name='interface')
    return app

"""Transactional storage shared by the local and hosted editions."""
from contextlib import contextmanager
from pathlib import Path
import sqlite3
import time
import psycopg
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool
from fastapi import HTTPException

DATABASE_ERRORS = (sqlite3.Error, psycopg.Error)

class QueryConnection:
    def __init__(self, connection, postgres=False):
        self.raw, self.postgres = connection, postgres

    def execute(self, sql, values=()):
        if self.postgres:
            sql = sql.replace('?', '%s')
        return self.raw.execute(sql, values)

    def serialize(self):
        if self.postgres:
            self.execute('SELECT pg_advisory_xact_lock(19821115)')
        else:
            self.execute('BEGIN IMMEDIATE')

class Database:
    def __init__(self, target):
        self.postgres = str(target).startswith(('postgres://', 'postgresql://'))
        self.target = target
        self.pool = None
        if self.postgres:
            self.pool = ConnectionPool(str(target), min_size=0, max_size=4, timeout=15,
                                       kwargs={'row_factory': dict_row, 'connect_timeout': 10,
                                               'sslmode': 'require', 'prepare_threshold': None}, open=True)
        else:
            Path(target).parent.mkdir(parents=True, exist_ok=True)
        self.initialize()

    @contextmanager
    def connect(self):
        if self.pool:
            with self.pool.connection() as raw:
                with raw.transaction():
                    raw.execute('SET LOCAL search_path TO vialivre')
                    yield QueryConnection(raw, True)
        else:
            raw = sqlite3.connect(self.target, timeout=15)
            raw.row_factory = sqlite3.Row
            try:
                with raw:
                    yield QueryConnection(raw)
            finally:
                raw.close()

    def initialize(self):
        if self.pool:
            with self.connect() as db:
                for table in ('records','analyses','users','sessions','quotas'):
                    row = db.execute('SELECT to_regclass(?) AS name', ('vialivre.' + table,)).fetchone()
                    if not row['name']:
                        raise RuntimeError('Aplique deploy/schema.sql ao banco antes de iniciar o servidor online.')
            return
        with self.connect() as db:
            if not self.postgres:
                db.execute('PRAGMA journal_mode=WAL')
            image_type = 'BYTEA' if self.postgres else 'BLOB'
            db.execute(f'CREATE TABLE IF NOT EXISTS records (id TEXT PRIMARY KEY, data TEXT NOT NULL, image {image_type} NOT NULL, version INTEGER NOT NULL)')
            db.execute('CREATE TABLE IF NOT EXISTS analyses (id TEXT PRIMARY KEY, image_hash TEXT NOT NULL, result TEXT NOT NULL, created TEXT NOT NULL)')
            db.execute('CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL)')
            db.execute('CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires BIGINT NOT NULL)')
            db.execute('CREATE TABLE IF NOT EXISTS quotas (bucket TEXT PRIMARY KEY, hits INTEGER NOT NULL, expires BIGINT NOT NULL)')

    def consume(self, action, subject, limit, seconds=86400):
        current = int(time.time())
        bucket = f'{action}:{subject}:{current // seconds}'
        with self.connect() as db:
            db.execute('DELETE FROM quotas WHERE expires < ?', (current,))
            row = db.execute('INSERT INTO quotas (bucket,hits,expires) VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET hits=quotas.hits+1 WHERE quotas.hits < ? RETURNING hits',
                             (bucket, (current // seconds + 1) * seconds, limit)).fetchone()
            if not row:
                raise HTTPException(429, 'Limite temporário de uso atingido. Tente novamente mais tarde.')

    def close(self):
        if self.pool:
            self.pool.close()

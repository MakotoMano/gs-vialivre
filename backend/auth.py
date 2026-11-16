import hashlib
import secrets
import time
import re
from fastapi import HTTPException

COOKIE = 'vialivre_session'
SESSION_SECONDS = 8 * 3600

def password_hash(password):
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=16384, r=8, p=1).hex()
    return salt.hex() + ':' + digest

def verify_password(password, encoded):
    salt, expected = encoded.split(':', 1)
    actual = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1).hex()
    return secrets.compare_digest(actual, expected)

def normalize_username(value):
    username = value.strip().lower()
    if not re.fullmatch(r'[a-z0-9_.-]{3,32}', username):
        raise HTTPException(422, 'O usuário deve ter de 3 a 32 letras, números, pontos, hífens ou sublinhados.')
    return username

def bootstrap_reviewer(database, username, password):
    username = normalize_username(username)
    if len(password) < 12:
        raise RuntimeError('Configure ADMIN_PASSWORD com pelo menos 12 caracteres no servidor.')
    with database.connect() as db:
        db.serialize()
        row = db.execute('SELECT * FROM users WHERE username=?', (username,)).fetchone()
        if row and row['role'] != 'reviewer':
            raise RuntimeError('O nome do revisor já pertence a uma conta de colaborador.')
        if not row:
            db.execute('INSERT INTO users VALUES (?,?,?,?)', (secrets.token_hex(16), username, password_hash(password), 'reviewer'))
        elif not verify_password(password, row['password_hash']):
            db.execute('UPDATE users SET password_hash=? WHERE id=?', (password_hash(password), row['id']))
            db.execute('DELETE FROM sessions WHERE user_id=?', (row['id'],))

def session_user(database, request):
    token = request.cookies.get(COOKIE, '')
    if not token or len(token) > 100:
        return None
    with database.connect() as db:
        row = db.execute('SELECT u.id,u.username,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires>?',
                         (hashlib.sha256(token.encode()).hexdigest(), int(time.time()))).fetchone()
    return dict(row) if row else None

def issue_session(database, user, response):
    token = secrets.token_urlsafe(32)
    current = int(time.time())
    with database.connect() as db:
        db.execute('DELETE FROM sessions WHERE expires <= ?', (current,))
        # One current session per account bounds storage and makes re-login revoke old tokens.
        db.execute('DELETE FROM sessions WHERE user_id=?', (user['id'],))
        db.execute('INSERT INTO sessions VALUES (?,?,?)', (hashlib.sha256(token.encode()).hexdigest(), user['id'], current + SESSION_SECONDS))
    response.set_cookie(COOKIE, token, max_age=SESSION_SECONDS, secure=True, httponly=True, samesite='strict', path='/')

def public_user(user):
    return {k: user[k] for k in ('id', 'username', 'role')} if user else None

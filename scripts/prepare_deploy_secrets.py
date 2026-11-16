"""Create local deployment secrets without displaying plaintext credentials."""
import base64
import hashlib
import hmac
import secrets
from pathlib import Path
from dotenv import dotenv_values

root=Path(__file__).resolve().parent.parent
path=root/'.env.deploy'
if not path.exists():
    path.write_text('ADMIN_USERNAME=revisor\nADMIN_PASSWORD='+secrets.token_urlsafe(24)+'\nREGISTRATION_CODE='+secrets.token_urlsafe(18)+'\nDATABASE_PASSWORD='+secrets.token_urlsafe(32)+'\n',encoding='utf-8')
values=dotenv_values(path)
password=values['DATABASE_PASSWORD']
salt=secrets.token_bytes(16)
salted=hashlib.pbkdf2_hmac('sha256',password.encode(),salt,4096)
client_key=hmac.new(salted,b'Client Key',hashlib.sha256).digest()
stored_key=hashlib.sha256(client_key).digest()
server_key=hmac.new(salted,b'Server Key',hashlib.sha256).digest()
enc=lambda value:base64.b64encode(value).decode()
# Only a SCRAM verifier is emitted for the database provisioning tool.
print('SCRAM-SHA-256$4096:'+enc(salt)+'$'+enc(stored_key)+':'+enc(server_key))

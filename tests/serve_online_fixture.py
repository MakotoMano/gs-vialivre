"""Isolated server used only by the browser test. No external classification calls."""
import os
import tempfile
from pathlib import Path
import uvicorn
from backend.app import create_app
from backend.database import Database

if __name__ == '__main__':
    os.environ['ADMIN_USERNAME']='revisor'
    os.environ['ADMIN_PASSWORD']='senha-de-teste-revisor'
    os.environ['REGISTRATION_CODE']='convite-de-teste'
    os.environ['ONLINE_ANALYSIS_ENABLED']='false'
    with tempfile.TemporaryDirectory() as folder:
        application=create_app(api_key='',online=True,database_override=Database(Path(folder)/'test.sqlite3'))
        uvicorn.run(application,host='127.0.0.1',port=8004)

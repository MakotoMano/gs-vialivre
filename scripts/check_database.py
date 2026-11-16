"""Read-only connectivity check plus a rolled-back transactional probe."""
from pathlib import Path
from dotenv import dotenv_values
from backend.database import Database
import secrets

class ProbeComplete(Exception):
    pass

if __name__ == '__main__':
    config=dotenv_values(Path(__file__).resolve().parent.parent/'.env.deploy')
    db=None
    try:
        db=Database(config['DATABASE_URL'])
        try:
            with db.connect() as connection:
                connection.serialize()
                record_id='PROBE-'+secrets.token_hex(8)
                connection.execute('INSERT INTO records VALUES (?,?,?,?)',(record_id,'{}',b'test',1))
                record=connection.execute('SELECT version,length(image) AS bytes FROM records WHERE id=?',(record_id,)).fetchone()
                assert record['version']==1 and record['bytes']==4
                connection.execute('UPDATE records SET version=? WHERE id=?',(2,record_id))
                assert connection.execute('SELECT version FROM records WHERE id=?',(record_id,)).fetchone()['version']==2
                raise ProbeComplete()
        except ProbeComplete:
            pass
        with db.connect() as connection:
            assert connection.execute('SELECT id FROM records WHERE id=?',(record_id,)).fetchone() is None
        print('PostgreSQL remoto: conexao, permissoes, gravacao, leitura e rollback verificados. Nenhum registro de teste permaneceu.')
    except Exception as exc:
        print('Falha na verificacao do PostgreSQL: '+type(exc).__name__)
        raise SystemExit(1)
    finally:
        if db:
            db.close()

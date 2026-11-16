import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.dirname(fileURLToPath(import.meta.url));
const python=path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
if(!existsSync(python)){
 console.error('Execute Instalar_ViaLivre.cmd antes de iniciar.');process.exit(1);
}
const child=spawn(python,['run.py'],{cwd:root,stdio:'inherit'});
child.on('error',()=>{console.error('Não foi possível iniciar o servidor local.');process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??1;});
process.on('SIGINT',()=>child.kill('SIGINT'));
process.on('SIGTERM',()=>child.kill('SIGTERM'));

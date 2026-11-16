@echo off
cd /d "%~dp0"
py -3 -m venv .venv
if errorlevel 1 goto error
".venv\Scripts\python.exe" -m pip install -r requirements.txt
if errorlevel 1 goto error
echo Instalacao concluida. Abra Iniciar_ViaLivre.cmd.
pause
exit /b 0
:error
echo Nao foi possivel instalar. Verifique Python 3.14 e sua conexao.
pause
exit /b 1

@echo off
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo Primeiro execute Instalar_ViaLivre.cmd.
  pause
  exit /b 1
)
".venv\Scripts\python.exe" run.py --open
if errorlevel 1 pause

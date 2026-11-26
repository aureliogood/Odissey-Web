@echo off
rem Sincroniza los tops de BK-Tops con Supabase.
rem Añade este .bat al Programador de tareas de Windows cada 5 minutos.
cd /d "%~dp0"
node sync-tops.cjs
if errorlevel 1 (
  echo.
  echo Ha fallado la sincronizacion. Revisa scripts\.env y los mensajes de arriba.
)

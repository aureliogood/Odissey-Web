@echo off
setlocal
rem Odissey - empaqueta la web\ en public_html.zip (el archivo que subes a Namecheap)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0package.ps1"
if errorlevel 1 (
  echo [ERROR] Fallo el empaquetado. No subas el zip.
  exit /b 1
)
echo.
echo [AVISO] Si tocaste theme.css, un .css o un .js, sube el ?v= de los HTML
echo         y el CACHE_NAME de service-worker.js, o los navegadores
echo         seguiran viendo la version vieja.
endlocal

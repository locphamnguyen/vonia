@echo off
rem Build Vonia Voice Studio tren Windows (cmd / double-click). Goi build.ps1.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build.ps1" %*
set RC=%ERRORLEVEL%
if "%~1"=="" pause
exit /b %RC%

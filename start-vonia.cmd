@echo off
rem Chay Vonia Voice Studio tren may nay (bam dup la chay).
rem Tu bat Docker Desktop + Redis, them ffmpeg vao PATH, mo trinh duyet.
setlocal
cd /d "%~dp0"
if not defined PORT set PORT=8002
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8

if not exist ".venv\Scripts\omnivoice-serve.exe" (
    echo [LOI] Chua build. Hay chay build.cmd truoc.
    pause
    exit /b 1
)

rem --- Docker Desktop ---
docker info >nul 2>&1
if errorlevel 1 (
    echo ==^> Bat Docker Desktop...
    start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    for /l %%i in (1,1,60) do (
        timeout /t 3 /nobreak >nul
        docker info >nul 2>&1 && goto docker_ok
    )
    echo [LOI] Docker Desktop khong khoi dong duoc.
    pause
    exit /b 1
)
:docker_ok

rem --- Redis (luu tai khoan + phien dang nhap) ---
docker container inspect vonia-redis >nul 2>&1
if errorlevel 1 (
    echo ==^> Tao container Redis vonia-redis
    docker run -d --name vonia-redis --restart unless-stopped -p 127.0.0.1:6379:6379 -v vonia-redis-data:/data redis:7-alpine redis-server --appendonly yes >nul
) else (
    docker start vonia-redis >nul
)

rem --- ffmpeg ---
where ffmpeg >nul 2>&1
if errorlevel 1 (
    for /d %%d in ("%LOCALAPPDATA%\Microsoft\WinGet\Packages\Gyan.FFmpeg_*") do (
        for /d %%e in ("%%d\ffmpeg-*") do set "PATH=%%e\bin;%PATH%"
    )
)

rem --- Mo trinh duyet sau ~20 giay (doi model nap len GPU) ---
start "" /b cmd /c "timeout /t 20 /nobreak >nul & start http://127.0.0.1:%PORT%"

echo ==^> Vonia dang chay tai http://127.0.0.1:%PORT%  (dong cua so nay de tat)
".venv\Scripts\omnivoice-serve.exe" --host 127.0.0.1 --port %PORT%
pause

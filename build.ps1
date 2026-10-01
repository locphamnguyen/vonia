# Build Vonia Voice Studio tren Windows (PowerShell 5+).
# Tu cai uv (va bun neu may chua co bun lan Node.js), roi chay scripts/build.py.
# Dung: .\build.ps1 [--torch auto|cuda|cpu] [--download-model] [--skip-web] [--dev]
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

# Terminal hien thi tieng Viet dung
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$env:PYTHONIOENCODING = 'utf-8'
$env:PYTHONUTF8 = '1'

$env:Path = "$HOME\.local\bin;$HOME\.cargo\bin;$HOME\.bun\bin;$env:Path"

function Test-Cmd($name) { [bool](Get-Command $name -ErrorAction SilentlyContinue) }

if (-not (Test-Cmd 'uv')) {
    Write-Host '==> Cai uv'
    powershell -NoProfile -ExecutionPolicy ByPass -Command "irm https://astral.sh/uv/install.ps1 | iex"
    $env:Path = "$HOME\.local\bin;$env:Path"
}

if (-not (Test-Cmd 'bun') -and -not (Test-Cmd 'npm')) {
    Write-Host '==> Cai bun (can de build giao dien web)'
    powershell -NoProfile -ExecutionPolicy ByPass -Command "irm https://bun.sh/install.ps1 | iex"
    $env:Path = "$HOME\.bun\bin;$env:Path"
}

uv run --no-project --python 3.12 scripts/build.py @args
exit $LASTEXITCODE

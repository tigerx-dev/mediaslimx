param(
    [int]$Port = 8766,
    [switch]$NoBrowser,
    [switch]$PrepareOnly
)
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$env:PYTHONUTF8 = "1"
$env:PYTHONIOENCODING = "utf-8"
$Project = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $Project
$Python = Join-Path $Project ".venv-win\Scripts\python.exe"
$DataDir = Join-Path $Project ".mediaslimx\windows"
try {
    if (-not (Test-Path -LiteralPath $Python)) {
        Write-Host "正在创建独立 Windows 环境 .venv-win（不使用 WSL .venv）..."
        if ($env:MEDIASLIMX_PYTHON) {
            & $env:MEDIASLIMX_PYTHON -m venv (Join-Path $Project ".venv-win")
        } elseif (Get-Command py -ErrorAction SilentlyContinue) {
            & py -3 -m venv (Join-Path $Project ".venv-win")
        } else {
            $Base = Get-Command python -ErrorAction SilentlyContinue
            if (-not $Base -or $Base.Source -like "*WindowsApps*") {
                throw "请安装 Python 3.10+（启用 PATH），或设置 MEDIASLIMX_PYTHON 为 python.exe 的完整路径，然后重新双击。"
            }
            & $Base.Source -m venv (Join-Path $Project ".venv-win")
        }
        if ($LASTEXITCODE -ne 0) { throw "Windows 虚拟环境创建失败，请检查 Python 安装。" }
    }
    & $Python -c "import os,sys,importlib.util; sys.exit(0 if os.name == 'nt' and sys.version_info >= (3,10) and all(importlib.util.find_spec(m) for m in ['fastapi','uvicorn','PIL']) else 1)" 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "首次启动，正在安装项目依赖..."
        & $Python -m pip install -r (Join-Path $Project "requirements-lock.txt")
        if ($LASTEXITCODE -ne 0) { throw "依赖安装失败，请检查网络后重新运行。原媒体未被处理。" }
    }
    if ($PrepareOnly) { return }
    Write-Host "MediaSlim X | Windows 本地 | 端口 $Port"
    Write-Host "环境：$Python"
    Write-Host "记录：$DataDir"
    Write-Host "首次启动时此窗口保持运行；再次双击会打开已有界面。WSL 环境和端口独立。"
    $Launch = @("-m", "mediaslimx", "--desktop", "--port", "$Port", "--data-dir", $DataDir, "--allow-root", $Project)
    if ($NoBrowser) { $Launch += "--no-browser" } else { $Launch += "--open-browser" }
    & $Python @Launch
    if ($LASTEXITCODE -ne 0) { throw "服务启动失败，请查看上方错误。端口占用时可使用 -Port 8768。" }
} catch {
    Write-Host $_ -ForegroundColor Red
    exit 1
}

param(
    [string]$Python = "",
    [string]$FFmpegDir = "",
    [string]$FFmpegMaterials = "",
    [string]$PythonMaterials = "",
    [string]$WindowHostMaterials = "",
    [string]$CleanWindowsEvidence = "",
    [string]$OutputDir = "",
    [string]$BuildId = ""
)
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$env:PYTHONUTF8 = "1"
$env:PYTHONIOENCODING = "utf-8"
$Project = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $Project
$BuildDir = Join-Path $Project ".mediaslimx\packaging\build-venv"
$BuildPython = Join-Path $BuildDir "Scripts\python.exe"
if (-not (Test-Path -LiteralPath $BuildPython)) {
    if ($Python) { & $Python -m venv $BuildDir }
    elseif (Get-Command py -ErrorAction SilentlyContinue) { & py -3 -m venv $BuildDir }
    else { throw "Supply -Python C:\path\python.exe (Windows Python 3.11+)." }
    if ($LASTEXITCODE -ne 0) { throw "Build venv failed." }
}
& $BuildPython -m pip install -r requirements-windows-portable.txt
if ($LASTEXITCODE -ne 0) { throw "Build dependencies failed." }
if ($FFmpegDir -and $FFmpegMaterials) { throw "Choose -FFmpegDir (prototype) OR -FFmpegMaterials (verified source/build materials)." }
if (-not $FFmpegDir -and -not $FFmpegMaterials) {
    $FFmpeg = Get-Command ffmpeg.exe -ErrorAction SilentlyContinue
    if (-not $FFmpeg) { throw "Supply -FFmpegDir with ffmpeg.exe and ffprobe.exe plus original license materials." }
    $FFmpegDir = Split-Path -Parent $FFmpeg.Source
}
$BuildArgs = @("scripts/build-windows.py")
if ($FFmpegMaterials) { $BuildArgs += @("--ffmpeg-materials", $FFmpegMaterials) }
else { $BuildArgs += @("--ffmpeg-dir", $FFmpegDir) }
if ($PythonMaterials) { $BuildArgs += @("--python-materials", $PythonMaterials) }
if ($WindowHostMaterials) { $BuildArgs += @("--window-host-materials", $WindowHostMaterials) }
if ($CleanWindowsEvidence) { $BuildArgs += @("--clean-windows-evidence", $CleanWindowsEvidence) }
if ($OutputDir) { $BuildArgs += @("--output-dir", $OutputDir) }
if ($BuildId) { $BuildArgs += @("--build-id", $BuildId) }
& $BuildPython @BuildArgs
if ($LASTEXITCODE -ne 0) { throw "Build failed." }

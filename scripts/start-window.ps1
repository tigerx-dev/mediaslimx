param(
    [int]$Port = 0,
    [string]$DataDir = "",
    [switch]$Wait
)
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$Project = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $Project
$env:PYTHONUTF8 = "1"
$env:PYTHONIOENCODING = "utf-8"
# Reuse dependency preparation without starting the existing browser service.
& (Join-Path $PSScriptRoot "start-windows.ps1") -PrepareOnly
if ($LASTEXITCODE -ne 0) { throw "Windows environment preparation failed." }
$Pin = Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot "window-host-sdk.json") | ConvertFrom-Json
$HostDir = Join-Path $Project (".mediaslimx\window-host\" + $Pin.version + "\bin")
if (-not $DataDir) { $DataDir = Join-Path $Project ".mediaslimx\windows-window" }
$ExistingOwnerActive = $false
$WindowRecord = Join-Path $DataDir "window.json"
if (Test-Path -LiteralPath $WindowRecord) {
    try {
        $Record = Get-Content -Raw -LiteralPath $WindowRecord | ConvertFrom-Json
        $null = Get-Process -Id $Record.owner_pid -ErrorAction Stop
        $null = Get-Process -Id $Record.host_pid -ErrorAction Stop
        # Python still verifies both process identities and the native window.
        $ExistingOwnerActive = $true
    } catch { }
}
$WindowSource = Join-Path $Project "native\MediaSlimX.Window.cs"
$BuiltSource = Join-Path $Project (".mediaslimx\window-host\" + $Pin.version + "\materials\MediaSlimX.Window.cs")
$NeedsHostBuild = -not (Test-Path -LiteralPath (Join-Path $HostDir "MediaSlimX.Window.exe")) -or -not (Test-Path -LiteralPath $BuiltSource)
if (-not $NeedsHostBuild) {
    $NeedsHostBuild = (Get-FileHash -LiteralPath $WindowSource -Algorithm SHA256).Hash -ne (Get-FileHash -LiteralPath $BuiltSource -Algorithm SHA256).Hash
}
if ($NeedsHostBuild -and -not $ExistingOwnerActive) {
    Write-Host "正在准备窗口组件 / Preparing the window component..."
    & (Join-Path $PSScriptRoot "build-window-host.ps1")
    if ($LASTEXITCODE -ne 0) { throw "Window component build failed." }
}
$PythonWindow = Join-Path $Project ".venv-win\Scripts\pythonw.exe"
$Launch = @("-m", "mediaslimx.window", "--data-dir", ('"{0}"' -f $DataDir), "--allow-root", ('"{0}"' -f $Project))
if ($Port -ne 0) { $Launch += @("--port", "$Port") }
$Process = Start-Process -FilePath $PythonWindow -ArgumentList $Launch -WorkingDirectory $Project -PassThru
if ($Wait) {
    $Process.WaitForExit()
    exit $Process.ExitCode
}

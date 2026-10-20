param([switch]$Offline)
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$Project = Split-Path -Parent $PSScriptRoot
$PinFile = Join-Path $PSScriptRoot "window-host-sdk.json"
$Pin = Get-Content -Raw -LiteralPath $PinFile | ConvertFrom-Json
if ($Pin.package -ne "Microsoft.Web.WebView2" -or $Pin.version -notmatch '^\d+\.\d+\.\d+\.\d+$') { throw "Invalid pinned SDK metadata." }
$Root = Join-Path $Project (".mediaslimx\window-host\" + $Pin.version)
$Materials = Join-Path $Root "materials"
$Bin = Join-Path $Root "bin"
[IO.Directory]::CreateDirectory($Materials) | Out-Null
[IO.Directory]::CreateDirectory($Bin) | Out-Null
$Package = Join-Path $Materials ("microsoft.web.webview2." + $Pin.version + ".nupkg")
if (-not (Test-Path -LiteralPath $Package)) {
    if ($Offline) { throw "Pinned SDK is not cached. Build once online, then use -Offline." }
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $Temporary = $Package + ".download"
    try {
        Invoke-WebRequest -UseBasicParsing -Uri $Pin.source -OutFile $Temporary
        Move-Item -LiteralPath $Temporary -Destination $Package
    } finally { if (Test-Path -LiteralPath $Temporary) { Remove-Item -LiteralPath $Temporary } }
}
foreach ($Algorithm in @("SHA256", "SHA512")) {
    $Actual = (Get-FileHash -LiteralPath $Package -Algorithm $Algorithm).Hash.ToLowerInvariant()
    if ($Actual -ne $Pin.($Algorithm.ToLowerInvariant())) { throw "Pinned WebView2 SDK $Algorithm mismatch; no binaries were built." }
}
Add-Type -AssemblyName System.IO.Compression.FileSystem
$Archive = [IO.Compression.ZipFile]::OpenRead($Package)
try {
    $Files = [ordered]@{
        "lib/net462/Microsoft.Web.WebView2.Core.dll" = (Join-Path $Bin "Microsoft.Web.WebView2.Core.dll")
        "lib/net462/Microsoft.Web.WebView2.WinForms.dll" = (Join-Path $Bin "Microsoft.Web.WebView2.WinForms.dll")
        "runtimes/win-x64/native/WebView2Loader.dll" = (Join-Path $Bin "WebView2Loader.dll")
        "LICENSE.txt" = (Join-Path $Materials "WebView2-LICENSE.txt")
        "NOTICE.txt" = (Join-Path $Materials "WebView2-NOTICE.txt")
        "Microsoft.Web.WebView2.nuspec" = (Join-Path $Materials "Microsoft.Web.WebView2.nuspec")
    }
    foreach ($EntryName in $Files.Keys) {
        $Entry = $Archive.GetEntry($EntryName)
        if (-not $Entry) { throw "SDK is missing expected entry: $EntryName" }
        [IO.Compression.ZipFileExtensions]::ExtractToFile($Entry, $Files[$EntryName], $true)
    }
} finally { $Archive.Dispose() }
$Source = Join-Path $Project "native\MediaSlimX.Window.cs"
$Icon = Join-Path $Project "assets\brand\app-icon.ico"
$Compiler = Join-Path $env:WINDIR "Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if (-not (Test-Path -LiteralPath $Compiler)) { throw ".NET Framework C# compiler is unavailable. Build on supported Windows with .NET Framework 4.8+." }
$Executable = Join-Path $Bin "MediaSlimX.Window.exe"
$Arguments = @("/nologo", "/target:winexe", "/platform:x64", "/optimize+", "/utf8output", "/codepage:65001", "/out:$Executable", "/win32icon:$Icon", "/reference:System.Windows.Forms.dll", "/reference:System.Drawing.dll", "/reference:System.Web.Extensions.dll", "/reference:$(Join-Path $Bin 'Microsoft.Web.WebView2.Core.dll')", "/reference:$(Join-Path $Bin 'Microsoft.Web.WebView2.WinForms.dll')", $Source)
$CompilerOutput = & $Compiler @Arguments 2>&1
if ($LASTEXITCODE -ne 0) { throw "Window helper compile failed: $($CompilerOutput -join [Environment]::NewLine)" }
$Configuration = @'
<?xml version="1.0" encoding="utf-8"?>
<configuration><startup useLegacyV2RuntimeActivationPolicy="true"><supportedRuntime version="v4.0" sku=".NETFramework,Version=v4.6.2"/></startup><runtime><AppContextSwitchOverrides value="Switch.System.IO.UseLegacyPathHandling=false;Switch.System.IO.BlockLongPaths=false"/></runtime></configuration>
'@
[IO.File]::WriteAllText(($Executable + ".config"), $Configuration, [Text.UTF8Encoding]::new($false))
Copy-Item -LiteralPath $Source -Destination (Join-Path $Materials "MediaSlimX.Window.cs") -Force
Copy-Item -LiteralPath $Icon -Destination (Join-Path $Materials "app-icon.ico") -Force
Copy-Item -LiteralPath $PSCommandPath -Destination (Join-Path $Materials "build-window-host.ps1") -Force
Copy-Item -LiteralPath $PinFile -Destination (Join-Path $Materials "window-host-sdk.json") -Force
Copy-Item -LiteralPath (Join-Path $Materials "WebView2-LICENSE.txt") -Destination (Join-Path $Bin "WebView2-LICENSE.txt") -Force
Copy-Item -LiteralPath (Join-Path $Materials "WebView2-NOTICE.txt") -Destination (Join-Path $Bin "WebView2-NOTICE.txt") -Force
$Inventory = @(foreach ($Directory in @($Materials, $Bin)) {
    Get-ChildItem -LiteralPath $Directory -File | Where-Object { $_.Name -ne "manifest.json" } | Sort-Object Name | ForEach-Object {
        [ordered]@{ path = $_.FullName.Substring($Root.Length + 1).Replace('\', '/'); bytes = $_.Length; sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant() }
    }
})
$Manifest = [ordered]@{ version = 1; status = "LOCAL_WINDOW_HOST_NOT_A_RELEASE"; sdk = $Pin; compiler = $Compiler; compiler_version = (Get-Item -LiteralPath $Compiler).VersionInfo.FileVersion; command = @($Compiler) + $Arguments; bin_dir = $Bin; materials_dir = $Materials; files = $Inventory }
$ManifestFile = Join-Path $Root "manifest.json"
[IO.File]::WriteAllText($ManifestFile, ($Manifest | ConvertTo-Json -Depth 8), [Text.UTF8Encoding]::new($false))
[ordered]@{ bin_dir = $Bin; executable = $Executable; manifest = $ManifestFile; sdk_version = $Pin.version } | ConvertTo-Json

# No developer Python, FFmpeg, Playwright or external network is required here.
# SandboxRun marks the intended scope, not proof of a clean OS by itself.
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$InputDir,
    [Parameter(Mandatory = $true)][string]$ReportDir,
    [switch]$SandboxRun,
    [switch]$HostHarnessSelfTest,
    [ValidateSet('WindowsSandbox', 'Hyper-V', 'fresh-machine')][string]$GuestKind = 'WindowsSandbox',
    [switch]$InteractiveObservations,
    [ValidateRange(10, 600)][int]$ObservationTimeoutSeconds = 180
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
if ($SandboxRun -eq $HostHarnessSelfTest) { throw 'Choose exactly one scope: SandboxRun or HostHarnessSelfTest.' }
if ($HostHarnessSelfTest -and $InteractiveObservations) { throw 'Host self-tests never request or accept guest observations.' }
Add-Type -AssemblyName System.Net.Http
$kit = Get-Content -LiteralPath (Join-Path $InputDir 'kit.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if ($SandboxRun -and $kit.host_computer_name -and $env:COMPUTERNAME -eq $kit.host_computer_name) {
    throw 'Guest mode refuses the machine that prepared this kit. Use HostHarnessSelfTest on the host.'
}
$work = Join-Path $env:LOCALAPPDATA ('MediaSlimX clean test\中文 路径 ' + $kit.run_id)
if (Test-Path -LiteralPath $work) { throw 'The private run directory already exists; prepare a new kit.' }
New-Item -ItemType Directory -Path $work -Force | Out-Null
New-Item -ItemType Directory -Path $ReportDir -Force | Out-Null
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$admin = ([Security.Principal.WindowsPrincipal]$identity).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$profileRegistryPath = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList\' + $identity.User.Value
$actualProfile = (Get-ItemProperty -LiteralPath $profileRegistryPath -Name ProfileImagePath -ErrorAction SilentlyContinue).ProfileImagePath
if ($actualProfile) { $actualProfile = [Environment]::ExpandEnvironmentVariables($actualProfile) }
$external = @(Get-Command python.exe,python3.exe,py.exe,ffmpeg.exe,ffprobe.exe -ErrorAction SilentlyContinue | ForEach-Object { $_.Source })
$os = Get-CimInstance Win32_OperatingSystem
$report = [ordered]@{
    schema = 1; run_id = $kit.run_id; package_sha256 = $kit.package_sha256; archive_sha256 = $kit.package_sha256
    started_utc = [DateTime]::UtcNow.ToString('o'); scope = $(if ($SandboxRun) { 'sandbox_requested' } else { 'host_harness_self_test' })
    clean_windows_os_verified = $false; clean_environment_confirmation = 'requires independent confirmation of the VM/Sandbox session'
    environment = [ordered]@{ os = $os.Caption; build = $os.BuildNumber; architecture = $os.OSArchitecture;
        computer = $env:COMPUTERNAME; user = $env:USERNAME; administrator = $admin; clean_windows = $false;
        virtualization = $(if ($SandboxRun) { $GuestKind } else { 'host-self-test' });
        external_commands = $external; actual_sid = $identity.User.Value; actual_profile_from_registry = $actualProfile;
        environment_user_profile = $env:USERPROFILE;
        actual_user_profile_contains_chinese = [bool]($actualProfile -and ($actualProfile -match '[\u4e00-\u9fff]') -and (Test-Path -LiteralPath $actualProfile)) }
    automated = [Collections.Generic.List[object]]::new()
    manual = [ordered]@{ default_browser = 'not_run'; native_directory_selection = 'not_run';
        screenshot = 'not_captured'; browser_survives_service_exit = 'not_run';
        smart_screen_mark_of_web = 'not_run'; real_chinese_username = 'not_run'; standard_user = 'not_run';
        observation_method = $(if ($HostHarnessSelfTest) { 'not_requested' } elseif ($InteractiveObservations) { 'interactive_human' } else { 'json_file_handshake' });
        observation_state = 'not_started' }
    status = 'not_run'; success = $false; release_gate_complete = $false
    coverage = [ordered]@{
        shutdown_method = 'Stop-Process -Force after processing has stopped and any picker has closed'
        idle_force_stop_restart_persistence = $true
        graceful_ctrl_break_with_active_picker_and_encoding = $false
        active_processing_crash_recovery = $false
        default_browser_and_picker_ui = $(if ($SandboxRun) { 'manual guest observations requested' } else { 'not exercised in host self-test' })
    }
}
$handler = [Net.Http.HttpClientHandler]::new()
$handler.UseProxy = $false
$client = [Net.Http.HttpClient]::new($handler)
$client.Timeout = [TimeSpan]::FromSeconds(120)
$script:service = $null
$script:token = ''
$script:origin = ''
$script:browserPids = @()
$state = Join-Path $work 'runtime-data'
$media = Join-Path $work '媒体 source'
$package = Join-Path $InputDir $kit.package_file
$exe = $null
$script:packageDirectory = $null
$script:packageAcl = $null
$exitCode = 1

function Assert-That([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw $Message }
}
function Save-Report {
    $report.updated_utc = [DateTime]::UtcNow.ToString('o')
    $report.checks = @($report.automated.ToArray())
    $report.manual_checks = @(
        @{name='default_browser'; status=$(if ($report.manual.default_browser -eq 'yes') {'passed'} else {'not_run'})},
        @{name='native_directory_selection'; status=$(if ($report.manual.native_directory_selection -eq 'selected_expected_synthetic_directory') {'passed'} else {'not_run'})},
        @{name='standard_user'; status=$(if ($report.manual.standard_user -eq 'observed_standard_user') {'passed'} else {'not_run'})},
        @{name='browser_survives_service_exit'; status=$(if ($report.manual.browser_survives_service_exit -eq 'browser_process_still_running') {'passed'} else {'not_run'})}
    )
    $report | ConvertTo-Json -Depth 15 | Set-Content -LiteralPath (Join-Path $ReportDir 'report.json') -Encoding UTF8
}
function Convert-GuestObservation {
    param([string]$Json, [string]$RunId, [string]$ArchiveHash, [string]$StageId, [bool]$HostSelfTest = $false)
    # Parsing an observation cannot grant clean-guest status to a host self-test.
    if ($HostSelfTest) { return $null }
    try { $value = $Json | ConvertFrom-Json -ErrorAction Stop } catch { return $null }
    if ($null -eq $value -or $value -is [array]) { return $null }
    $allowed = @('schema', 'run_id', 'archive_sha256', 'stage_id', 'default_browser', 'clean_environment', 'screenshot_names')
    if (@($value.PSObject.Properties | Where-Object { $_.Name -notin $allowed }).Count -gt 0) { return $null }
    if (($value.schema -isnot [int] -and $value.schema -isnot [long]) -or $value.schema -ne 1) { return $null }
    if ($value.run_id -isnot [string] -or $value.run_id -cne $RunId -or
        $value.archive_sha256 -isnot [string] -or $value.archive_sha256 -cne $ArchiveHash -or
        $value.stage_id -isnot [string] -or $value.stage_id -cne $StageId) { return $null }
    if ($value.default_browser -isnot [bool] -or $value.clean_environment -isnot [bool]) { return $null }
    if ($null -ne $value.screenshot_names) {
        if ($value.screenshot_names -isnot [array] -or $value.screenshot_names.Count -gt 12) { return $null }
        foreach ($name in $value.screenshot_names) {
            if ($name -isnot [string] -or $name -notmatch '^[A-Za-z0-9_-]{1,100}\.(png|jpg|jpeg)$') { return $null }
        }
    }
    return $value
}
function Write-GuestStage([string]$Kind, [string]$StageId, [bool]$Finished = $false) {
    if (-not $SandboxRun) { return }
    $stage = [ordered]@{ schema = 1; kind = $Kind; stage_id = $StageId; run_id = $kit.run_id;
        archive_sha256 = $kit.package_sha256; updated_utc = [DateTime]::UtcNow.ToString('o');
        finished = $Finished; report_status = $report.status; observation_timeout_seconds = $ObservationTimeoutSeconds;
        observation_file = 'guest-observations.json'; expected_picker_path = $media;
        service_port = $(if ($script:origin) { ([uri]$script:origin).Port } else { $null }); contains_authentication_token = $false }
    $temporary = Join-Path $ReportDir 'guest-stage.tmp'
    $stage | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $temporary -Encoding UTF8
    Move-Item -LiteralPath $temporary -Destination (Join-Path $ReportDir 'guest-stage.json') -Force
}
function Wait-GuestObservation([string]$StageId) {
    if ($HostHarnessSelfTest) { return $null }
    $path = Join-Path $ReportDir 'guest-observations.json'
    $deadline = [DateTime]::UtcNow.AddSeconds($ObservationTimeoutSeconds)
    do {
        if (Test-Path -LiteralPath $path) {
            try {
                $file = Get-Item -LiteralPath $path
                if (($file.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $file.Length -gt 65536) { return $null }
                $text = Get-Content -LiteralPath $path -Raw -Encoding UTF8
                $value = Convert-GuestObservation -Json $text -RunId $kit.run_id -ArchiveHash $kit.package_sha256 `
                    -StageId $StageId -HostSelfTest ([bool]$HostHarnessSelfTest)
                if ($null -ne $value) { return $value }
            } catch { } # An operator may be replacing the JSON file atomically.
        }
        Start-Sleep -Milliseconds 500
    } while ([DateTime]::UtcNow -lt $deadline)
    return $null
}
function Check([string]$Name, [scriptblock]$Action) {
    $clock = [Diagnostics.Stopwatch]::StartNew()
    try {
        & $Action
        $report.automated.Add([ordered]@{ name = $Name; status = 'passed'; seconds = [Math]::Round($clock.Elapsed.TotalSeconds, 3) })
        Write-Host ('PASS ' + $Name)
    } catch {
        $report.automated.Add([ordered]@{ name = $Name; status = 'failed'; seconds = [Math]::Round($clock.Elapsed.TotalSeconds, 3); error = $_.Exception.Message })
        throw
    } finally { Save-Report }
}
function Hash([string]$Path) { return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant() }
function Api([string]$Path, $Body = $null, [string]$Method = '', [byte[]]$Bytes = $null, [string]$OutFile = '') {
    if (-not $Method) { $Method = $(if ($null -eq $Body) { 'GET' } else { 'POST' }) }
    $request = [Net.Http.HttpRequestMessage]::new([Net.Http.HttpMethod]::new($Method), $script:origin + $Path)
    $request.Headers.Add('X-MediaSlimX-Token', $script:token)
    $request.Headers.Add('Origin', $script:origin)
    if ($null -ne $Bytes) {
        $request.Content = [Net.Http.ByteArrayContent]::new($Bytes)
        $request.Content.Headers.ContentType = [Net.Http.Headers.MediaTypeHeaderValue]::new('application/octet-stream')
    } elseif ($null -ne $Body) {
        $request.Content = [Net.Http.StringContent]::new(($Body | ConvertTo-Json -Depth 12 -Compress), [Text.Encoding]::UTF8, 'application/json')
    }
    $response = $null
    try {
        $response = $client.SendAsync($request).GetAwaiter().GetResult()
        $content = $response.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult()
        if (-not $response.IsSuccessStatusCode) { throw ('API ' + $Path + ': HTTP ' + [int]$response.StatusCode + ' ' + [Text.Encoding]::UTF8.GetString($content)) }
        if ($OutFile) { [IO.File]::WriteAllBytes($OutFile, $content); return }
        if ($response.Content.Headers.ContentType.MediaType -eq 'application/json') {
            return ([Text.Encoding]::UTF8.GetString($content) | ConvertFrom-Json)
        }
        return ,$content
    } finally {
        if ($null -ne $response) { $response.Dispose() }
        $request.Dispose()
    }
}
function Wait-Task([string]$Id) {
    $deadline = [DateTime]::UtcNow.AddMinutes(4)
    do {
        $task = Api ('/api/tasks/' + $Id)
        if ($task.status -notin @('running', 'queued', 'cancelling', 'restoring')) { return $task }
        Start-Sleep -Milliseconds 100
    } while ([DateTime]::UtcNow -lt $deadline)
    throw 'Task did not finish within four minutes.'
}
function Start-ServiceUnderTest([bool]$Browser) {
    $arguments = '--data-dir "' + $state + '" --allow-root "' + $work + '"'
    if (-not $Browser) { $arguments += ' --no-browser' }
    # Apply only to our child process. The host harness remains a developer-host
    # test even with a minimal child PATH; it never attests a clean OS.
    $previousPath = $env:PATH
    try {
        $env:PATH = Join-Path $env:SystemRoot 'System32'
        $script:service = Start-Process -FilePath $exe -ArgumentList $arguments -WorkingDirectory $env:SystemRoot -PassThru `
            -RedirectStandardOutput (Join-Path $work 'service-out.log') -RedirectStandardError (Join-Path $work 'service-error.log')
    } finally { $env:PATH = $previousPath }
    $record = Join-Path $state 'server.json'
    $deadline = [DateTime]::UtcNow.AddSeconds(45)
    do {
        $script:service.Refresh()
        if ($script:service.HasExited) { throw 'EXE exited before readiness; see redacted service log.' }
        if (Test-Path -LiteralPath $record) {
            try {
                $server = Get-Content -LiteralPath $record -Raw -Encoding UTF8 | ConvertFrom-Json
                $url = [uri]$server.url
                $script:origin = $url.GetLeftPart([UriPartial]::Authority)
                $script:token = [uri]::UnescapeDataString($url.Fragment.Substring(1).Split('=')[1])
                $environment = Api '/api/environment'
                if ($environment.pid -eq $script:service.Id) { return $environment }
            } catch { }
        }
        Start-Sleep -Milliseconds 100
    } while ([DateTime]::UtcNow -lt $deadline)
    throw 'EXE readiness timed out.'
}
function Stop-ServiceUnderTest {
    # Intentionally a force-stop persistence check, not a Ctrl+C/Ctrl+Break or
    # graceful shutdown check. No task/picker is active at the restart assertion.
    if ($script:service -and -not $script:service.HasExited) {
        Stop-Process -Id $script:service.Id -Force
        $script:service.WaitForExit(15000) | Out-Null
        Start-Sleep -Milliseconds 500
    }
}

try {
    Check 'package and synthetic-fixture SHA256' {
        Assert-That ((Hash $package) -eq $kit.package_sha256) 'Package hash differs from prepared kit.'
        foreach ($item in $kit.fixtures.PSObject.Properties) {
            Assert-That ((Hash (Join-Path (Join-Path $InputDir 'fixtures') $item.Name)) -eq $item.Value) ('Fixture hash differs: ' + $item.Name)
        }
        Expand-Archive -LiteralPath $package -DestinationPath (Join-Path $work '解压 application')
        $script:exe = Join-Path (Join-Path (Join-Path $work '解压 application') $kit.package_folder) 'MediaSlimX.exe'
        Assert-That (Test-Path -LiteralPath $exe) 'ZIP does not contain the expected EXE.'
        $manifestPath = Join-Path (Split-Path -Parent $exe) 'BUILD-MANIFEST.json'
        if (Test-Path -LiteralPath $manifestPath) {
            $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
            $report.bundle_payload_sha256 = $manifest.bundle_payload_sha256
        }
        New-Item -ItemType Directory -Path $media | Out-Null
        foreach ($name in @('picture.jpg', 'picture.png', 'picture.webp', 'video.mp4', 'document.pdf')) {
            Copy-Item -LiteralPath (Join-Path (Join-Path $InputDir 'fixtures') $name) -Destination $media
        }
        $script:originalHashes = @{}
        Get-ChildItem -LiteralPath $media -File | ForEach-Object { $script:originalHashes[$_.Name] = Hash $_.FullName }
    }
    Check 'extracted application directory is read-only for the actual account' {
        $script:packageDirectory = Split-Path -Parent $exe
        $script:packageAcl = Get-Acl -LiteralPath $packageDirectory
        $acl = Get-Acl -LiteralPath $packageDirectory
        $rule = [Security.AccessControl.FileSystemAccessRule]::new($identity.User,
            [Security.AccessControl.FileSystemRights]'Write,Delete,DeleteSubdirectoriesAndFiles',
            [Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit',
            [Security.AccessControl.PropagationFlags]::None, [Security.AccessControl.AccessControlType]::Deny)
        $acl.AddAccessRule($rule)
        Set-Acl -LiteralPath $packageDirectory -AclObject $acl
        $denied = $false
        try { [IO.File]::WriteAllText((Join-Path $packageDirectory 'must-not-be-created.tmp'), 'probe') }
        catch [UnauthorizedAccessException] { $denied = $true }
        Assert-That $denied 'The extracted application folder is writable, so the read-only scenario is untested.'
    }
    Check 'self-contained EXE startup, native engine availability and independent state' {
        $script:runtime = Start-ServiceUnderTest ([bool]$SandboxRun)
        Assert-That ($runtime.ffmpeg -and $runtime.ffprobe -and $runtime.pdf -and $runtime.native_picker) 'A bundled processing engine/picker is unavailable.'
        Assert-That ($runtime.data_dir -eq $state) 'State escaped its private test directory.'
        Assert-That ($runtime.port -ne 8766) 'Test unexpectedly reused the source service port.'
        Assert-That ($origin.StartsWith('http://127.0.0.1:')) 'Service does not use IPv4 loopback.'
        if ($SandboxRun) {
            $unexpected = @($external | Where-Object { $_ -notmatch '\\Microsoft\\WindowsApps\\python' })
            Assert-That ($unexpected.Count -eq 0) 'The requested clean environment contains external developer/media commands.'
        }
    }
    Check 'JPG PNG static-WebP MP4 PDF scan, real export and unchanged originals' {
        $scan = Api '/api/scans' @{ path = $media }
        Assert-That (@($scan.entries).Count -eq 5) 'Expected all five synthetic media types.'
        Assert-That (@($scan.entries | Where-Object { $_.status -ne 'ready' }).Count -eq 0) 'A synthetic format was skipped.'
        $script:exportTaskId = (Api '/api/tasks' @{ scan_id = $scan.id; selected = @($scan.entries | ForEach-Object { $_.id });
            preset = 'balanced'; mode = 'export'; output = (Join-Path $work 'export output') }).id
        $script:exportTask = Wait-Task $exportTaskId
        Assert-That (@($exportTask.entries | Where-Object { $_.status -notin @('success','no_gain') }).Count -eq 0) 'A real export failed.'
        foreach ($entry in $exportTask.entries) {
            Assert-That (Test-Path -LiteralPath $entry.destination) 'An exported result is missing.'
            Assert-That ((Hash (Join-Path $media $entry.relative)) -eq $originalHashes[$entry.relative]) 'An original changed during export.'
        }
        Api ('/api/tasks/' + $exportTaskId + '/report.csv') -OutFile (Join-Path $ReportDir 'synthetic-report.csv')
        $jpeg = $exportTask.entries | Where-Object { $_.relative -eq 'picture.jpg' }
        $preview = Join-Path $work 'preview.jpg'
        Api ('/api/tasks/' + $exportTaskId + '/preview/' + $jpeg.id + '/result') -OutFile $preview
        Assert-That ((Hash $preview) -eq (Hash $jpeg.destination)) 'Preview does not match actual output.'
    }
    Check 'backup-before-replace, exact restoration and conflict protection' {
        $backupSource = Join-Path $work 'backup source'
        New-Item -ItemType Directory -Path $backupSource | Out-Null
        Copy-Item -LiteralPath (Join-Path $media 'picture.jpg') -Destination (Join-Path $backupSource 'restore.jpg')
        Copy-Item -LiteralPath (Join-Path $media 'picture.jpg') -Destination (Join-Path $backupSource 'conflict.jpg')
        $scan = Api '/api/scans' @{ path = $backupSource }
        $script:backupTaskId = (Api '/api/tasks' @{ scan_id = $scan.id; selected = @($scan.entries | ForEach-Object { $_.id });
            preset = 'balanced'; max_width = 160; mode = 'backup'; backup = (Join-Path $work 'backups') }).id
        $task = Wait-Task $backupTaskId
        Assert-That (@($task.entries | Where-Object { $_.status -ne 'success' }).Count -eq 0) 'Resize/backup did not produce smaller valid images.'
        foreach ($entry in $task.entries) { Assert-That ((Hash $entry.backup) -eq $originalHashes['picture.jpg']) 'Backup bytes differ from original.' }
        $restore = $task.entries | Where-Object { $_.relative -eq 'restore.jpg' }
        Api ('/api/tasks/' + $backupTaskId + '/restore') @{ entry_id = $restore.id } | Out-Null
        Assert-That ((Hash $restore.source) -eq $originalHashes['picture.jpg']) 'Restoration did not reproduce the original.'
        $conflict = $task.entries | Where-Object { $_.relative -eq 'conflict.jpg' }
        $stream = [IO.File]::Open($conflict.source, [IO.FileMode]::Append)
        try { $stream.WriteByte(32) } finally { $stream.Dispose() }
        $changed = Hash $conflict.source
        Api ('/api/tasks/' + $backupTaskId + '/restore') @{ entry_id = $conflict.id } | Out-Null
        $after = Api ('/api/tasks/' + $backupTaskId)
        Assert-That (($after.entries | Where-Object { $_.id -eq $conflict.id }).status -eq 'restore_conflict') 'Modified result was not protected.'
        Assert-That ((Hash $conflict.source) -eq $changed) 'Conflicting restoration overwrote the modified file.'
    }
    Check 'browser import API, safe copy release and preserved export/report' {
        $bytes = [IO.File]::ReadAllBytes((Join-Path $media 'picture.jpg'))
        $batch = Api '/api/imports' @{ files = @(@{ name = 'dropped.jpg'; size = $bytes.Length }) }
        Api ('/api/imports/' + $batch.id + '/files/' + $batch.files[0].id) -Method PUT -Bytes $bytes | Out-Null
        $scan = Api ('/api/imports/' + $batch.id + '/scan') @{}
        $id = (Api '/api/tasks' @{ scan_id = $scan.id; selected = @($scan.entries[0].id); preset = 'balanced';
            mode = 'export'; output = (Join-Path $work 'import exports') }).id
        $task = Wait-Task $id
        Assert-That ($task.entries[0].status -in @('success','no_gain','duplicate')) 'Imported media export failed.'
        $destination = $task.entries[0].destination
        $resultHash = Hash $destination
        $before = (Api '/api/imports/storage').usage_bytes
        $preview = Api ('/api/imports/' + $batch.id + '/release-preview')
        $release = Api ('/api/imports/' + $batch.id + '/release') @{ confirm = $true; record_version = $preview.record_version }
        Assert-That ($release.released -and (Api '/api/imports/storage').usage_bytes -lt $before) 'Import storage was not released.'
        Assert-That ((Hash $destination) -eq $resultHash) 'Releasing imported copies changed the export.'
        Assert-That ((Hash (Join-Path $media 'picture.jpg')) -eq $originalHashes['picture.jpg']) 'Releasing imported copies changed the original.'
        Assert-That ((Api ('/api/tasks/' + $id)).import_copies_released) 'Task did not record unavailable original copies.'
        Api ('/api/tasks/' + $id + '/report.csv') -OutFile (Join-Path $ReportDir 'synthetic-import-report.csv')
    }
    Check 'cancel remaining work and preserve original synthetic media' {
        $cancelSource = Join-Path $work 'cancel source'
        New-Item -ItemType Directory -Path $cancelSource | Out-Null
        Copy-Item -LiteralPath (Join-Path (Join-Path $InputDir 'fixtures') 'cancel.mp4') -Destination (Join-Path $cancelSource '000-cancel.mp4')
        foreach ($number in 1..24) { Copy-Item -LiteralPath (Join-Path $media 'picture.jpg') -Destination (Join-Path $cancelSource ('image-{0:D3}.jpg' -f $number)) }
        $scan = Api '/api/scans' @{ path = $cancelSource }
        $id = (Api '/api/tasks' @{ scan_id = $scan.id; selected = @($scan.entries | ForEach-Object { $_.id });
            preset = 'balanced'; mode = 'export'; output = (Join-Path $work 'cancel output') }).id
        Api ('/api/tasks/' + $id + '/cancel') @{} | Out-Null
        $task = Wait-Task $id
        Assert-That ($task.status -eq 'cancelled' -and @($task.entries | Where-Object { $_.status -eq 'cancelled' }).Count -gt 0) 'Cancellation was not observed.'
        Assert-That ((Hash (Join-Path $cancelSource '000-cancel.mp4')) -eq $kit.fixtures.'cancel.mp4') 'Cancellation changed original video bytes.'
        $workDir = Join-Path $state 'work'
        if (Test-Path -LiteralPath $workDir) { Assert-That (@(Get-ChildItem -LiteralPath $workDir -Force).Count -eq 0) 'Unfinished processing temporary files were retained.' }
    }
    Check 'idle force-stop and restart preserve completed reports and backup information' {
        Stop-ServiceUnderTest
        # A guest operator must inspect the newly authenticated session after
        # this restart; the first browser tab now contains the previous token.
        $null = Start-ServiceUnderTest ([bool]$SandboxRun)
        $persisted = Api ('/api/tasks/' + $backupTaskId)
        Assert-That (@($persisted.entries | Where-Object { $_.backup -and (Test-Path -LiteralPath $_.backup) }).Count -eq 2) 'Backup information did not survive restart.'
        Api ('/api/tasks/' + $exportTaskId + '/report.csv') -OutFile (Join-Path $ReportDir 'synthetic-report-after-restart.csv')
    }
    $report.success = $true
    $report.status = $(if ($HostHarnessSelfTest) { 'host_self_test_passed' } else { 'partial' })
    $exitCode = 0
    if ($SandboxRun) {
        Write-Host 'Automated checks finished. Guest observations are pending; no result is inferred from host tests.'
        $report.manual.standard_user = $(if (-not $admin) { 'observed_standard_user' } else { 'not_tested_admin_session' })
        $report.manual.real_chinese_username = $(if ($report.environment.actual_user_profile_contains_chinese) { 'observed' } else { 'not_tested_only_chinese_working_path' })
        $stageId = [Guid]::NewGuid().ToString('N')
        $report.manual.observation_state = 'awaiting_observation'
        Save-Report
        Write-GuestStage 'awaiting_browser_observation' $stageId
        $observation = $null
        if ($InteractiveObservations) {
            $browserAnswer = Read-Host 'Did the CURRENT launch open the actual default browser and show the workbench? (yes/no/not_tested)'
            $cleanAnswer = Read-Host 'Are you observing a fresh Windows Sandbox/clean VM with no developer environment? (yes/no)'
            $observation = [pscustomobject]@{ default_browser = ($browserAnswer -eq 'yes'); clean_environment = ($cleanAnswer -eq 'yes'); screenshot_names = @() }
        } else {
            $observation = Wait-GuestObservation $stageId
        }
        if ($null -eq $observation) {
            $report.manual.observation_state = 'pending_missing_or_invalid_observation'
        } else {
            $report.manual.observation_state = 'received_bound_observation'
            $report.manual.default_browser = $(if ($observation.default_browser) { 'yes' } else { 'not_confirmed' })
            $report.clean_environment_confirmation = $(if ($observation.clean_environment) { 'yes' } else { 'not_confirmed' })
            $report.clean_windows_os_verified = [bool]$observation.clean_environment
            $report.environment.clean_windows = $report.clean_windows_os_verified
            $captured = @($observation.screenshot_names | Where-Object { Test-Path -LiteralPath (Join-Path $ReportDir $_) -PathType Leaf })
            if ($captured.Count -gt 0) { $report.manual.screenshot = $captured -join ', ' }
            $requestId = [Guid]::NewGuid().ToString('N')
            Write-GuestStage 'awaiting_native_directory_selection' ([Guid]::NewGuid().ToString('N'))
            $picker = Start-Job -ScriptBlock {
                param($base, $secret, $id)
                Invoke-RestMethod -Uri ($base + '/api/directories/native') -Method POST -ContentType 'application/json' `
                    -Headers @{ 'X-MediaSlimX-Token' = $secret; Origin = $base } -Body (@{ purpose = 'media'; request_id = $id } | ConvertTo-Json)
            } -ArgumentList $origin, $token, $requestId
            Write-Host ('In the native directory window choose this synthetic folder: ' + $media)
            try {
                $response = $picker | Wait-Job -Timeout $ObservationTimeoutSeconds | Receive-Job
                $report.manual.native_directory_selection = $(if ($response.path -eq $media) { 'selected_expected_synthetic_directory' } else { 'cancelled_or_wrong_directory' })
            } finally {
                Api '/api/directories/native/cancel' @{ request_id = $requestId } | Out-Null
                $picker | Stop-Job
                $picker | Remove-Job -Force
            }
            if ($InteractiveObservations) {
                $report.manual.screenshot = Read-Host 'After capturing guest screenshots to the evidence folder, enter names; otherwise not_captured'
            }
            $script:browserPids = @(Get-Process msedge,chrome,firefox -ErrorAction SilentlyContinue | ForEach-Object { $_.Id })
            Stop-ServiceUnderTest
            $survivors = @()
            if ($browserPids.Count -gt 0) { $survivors = @(Get-Process -Id $browserPids -ErrorAction SilentlyContinue) }
            $report.manual.browser_survives_service_exit = $(if ($survivors.Count -gt 0) { 'browser_process_still_running' } else { 'not_confirmed' })
        }
        $report.manual.smart_screen_mark_of_web = 'not_tested_no_internet_download_mark'
        if ($report.clean_windows_os_verified -and -not $admin -and $report.manual.default_browser -eq 'yes' -and
            $report.manual.native_directory_selection -eq 'selected_expected_synthetic_directory' -and
            $report.manual.browser_survives_service_exit -eq 'browser_process_still_running') {
            $report.status = 'passed'
        }
    }
} catch {
    $report.status = 'failed'
    $report.error = $_.Exception.Message
    Write-Host ('FAIL ' + $report.error) -ForegroundColor Red
} finally {
    Stop-ServiceUnderTest
    if ($script:packageAcl -and $script:packageDirectory) {
        Set-Acl -LiteralPath $script:packageDirectory -AclObject $script:packageAcl
    }
    foreach ($name in @('service-out.log', 'service-error.log')) {
        $path = Join-Path $work $name
        if (Test-Path -LiteralPath $path) {
            $text = Get-Content -LiteralPath $path -Raw -Encoding UTF8
            if ($token) { $text = $text.Replace($token, '[REDACTED]') }
            $text = $text -replace '#token=[A-Za-z0-9_-]+', '#token=[REDACTED]'
            $text | Set-Content -LiteralPath (Join-Path $ReportDir ('redacted-' + $name)) -Encoding UTF8
        }
    }
    $report.finished_utc = [DateTime]::UtcNow.ToString('o')
    Save-Report
    if ($SandboxRun) {
        $kind = $(if ($report.manual.observation_state -eq 'pending_missing_or_invalid_observation') { 'pending_manual_observation' } else { 'finished_' + $report.status })
        Write-GuestStage $kind ([Guid]::NewGuid().ToString('N')) $true
    }
    $client.Dispose()
}
Write-Host ('Evidence: ' + (Join-Path $ReportDir 'report.json'))
if ($HostHarnessSelfTest) { Write-Host 'Host harness self-test only. No clean-Windows, real-browser, SmartScreen or standard-user acceptance is claimed.' }
exit $exitCode

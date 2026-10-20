# Load only the pure JSON validator, not the harness or any UI/system actions.
$ErrorActionPreference = 'Stop'
$source = Join-Path (Split-Path -Parent $PSScriptRoot) 'scripts\clean-windows-harness.ps1'
$tokens = $null; $parseErrors = $null
$tree = [Management.Automation.Language.Parser]::ParseFile($source, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count) { throw 'Harness has parser errors.' }
$functions = @($tree.FindAll({ param($node)
    $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Convert-GuestObservation'
}, $true))
if ($functions.Count -ne 1) { throw 'Expected exactly one pure observation validator.' }
Invoke-Expression $functions[0].Extent.Text
$runId = 'a' * 32; $archiveHash = 'b' * 64; $stageId = 'c' * 32
function Observation { return @{schema=1;run_id=$runId;archive_sha256=$archiveHash;stage_id=$stageId;default_browser=$true;clean_environment=$true;screenshot_names=@('guest-browser.png')} }
function Validate($Value, [bool]$HostSelfTest = $false) {
    return Convert-GuestObservation -Json ($Value | ConvertTo-Json -Compress) -RunId $runId `
        -ArchiveHash $archiveHash -StageId $stageId -HostSelfTest $HostSelfTest
}
function Reject($Value, [string]$Label) {
    if ($null -ne (Validate $Value)) { throw ('Unexpectedly accepted: ' + $Label) }
}
$good = Validate (Observation)
if ($null -eq $good -or -not $good.default_browser -or -not $good.clean_environment) { throw 'Valid bound observation was rejected.' }
$falseObservation = Observation; $falseObservation.default_browser=$false; $falseObservation.clean_environment=$false
$negative = Validate $falseObservation
if ($null -eq $negative -or $negative.default_browser -or $negative.clean_environment) { throw 'Negative observation became a positive claim.' }
if ($null -ne (Validate (Observation) $true)) { throw 'A host self-test accepted clean-guest evidence.' }
foreach ($field in @('run_id','archive_sha256','stage_id')) {
    $value=Observation;$value[$field]='wrong';Reject $value ('mismatched '+$field)
}
foreach ($field in @('default_browser','clean_environment')) {
    $value=Observation;$value[$field]='true';Reject $value ('string boolean '+$field)
    $value=Observation;$value.Remove($field);Reject $value ('missing '+$field)
}
foreach ($name in @('../private.png','C:\private.png','nested/file.png','../file.txt')) {
    $value=Observation;$value.screenshot_names=@($name);Reject $value ('unsafe screenshot '+$name)
}
$extra=Observation;$extra.force_clean=$true;Reject $extra 'unexpected override field'
if ($null -ne (Convert-GuestObservation -Json '{incomplete' -RunId $runId -ArchiveHash $archiveHash -StageId $stageId)) { throw 'Malformed JSON was accepted.' }
$waitFunctions = @($tree.FindAll({ param($node)
    $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Wait-GuestObservation'
}, $true))
if ($waitFunctions.Count -ne 1) { throw 'Expected exactly one observation wait function.' }
Invoke-Expression $waitFunctions[0].Extent.Text
$ReportDir = Join-Path ([IO.Path]::GetTempPath()) ('msx-observation-unit-' + [Guid]::NewGuid().ToString('N'))
$HostHarnessSelfTest = $false; $ObservationTimeoutSeconds = 0
$kit = [pscustomobject]@{run_id=$runId;package_sha256=$archiveHash}
if ($null -ne (Wait-GuestObservation $stageId)) { throw 'A missing observation file produced evidence.' }
if (Test-Path -LiteralPath $ReportDir) { throw 'The missing-observation check unexpectedly created evidence.' }
$stageFunctions = @($tree.FindAll({ param($node)
    $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Write-GuestStage'
}, $true))
if ($stageFunctions.Count -ne 1) { throw 'Expected exactly one stage serializer.' }
Invoke-Expression $stageFunctions[0].Extent.Text
New-Item -ItemType Directory -Path $ReportDir | Out-Null
try {
    $SandboxRun=$true; $report=@{status='partial'}; $runtime=@{port=45000}; $media='C:\synthetic-only'
    $script:origin='http://127.0.0.1:45001';$script:token='unit-only-secret-must-not-appear'
    Write-GuestStage 'awaiting_browser_observation' $stageId
    $stageText=Get-Content -LiteralPath (Join-Path $ReportDir 'guest-stage.json') -Raw -Encoding UTF8
    $stage=$stageText|ConvertFrom-Json
    if ($stage.service_port -ne 45001) { throw 'Stage reused the port from before the restart.' }
    if ($stage.contains_authentication_token -or $stageText.Contains($script:token)) { throw 'Stage disclosed an authentication token.' }
} finally { Remove-Item -LiteralPath $ReportDir -Recurse -Force }
Write-Output 'PASS 8 observation risk groups: bound evidence, explicit negatives, host rejection, stale identity, strict booleans, screenshot/JSON boundaries, missing observations, current-port/no-token stage.'

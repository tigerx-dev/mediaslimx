# Non-admin, offline policy checks. Every Windows feature command is a stub.
# The production script is parsed to load its operation function only; the full
# entry point is invoked only to prove that its real non-admin gate rejects it.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$administrator = ([Security.Principal.WindowsPrincipal]$identity).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)
if ($administrator) { throw 'These mock tests must run without administrator rights.' }

$script:FeatureStates = @()
$script:GetCalls = 0
$script:EnableCalls = @()
$script:ExecutableExists = $false
function Get-WindowsOptionalFeature {
    [CmdletBinding()]
    param([switch]$Online, [string]$FeatureName)
    if (-not $Online -or $FeatureName -ne 'Containers-DisposableClientVM') { throw 'Unexpected feature query.' }
    if ($script:GetCalls -ge $script:FeatureStates.Count) { throw 'Unexpected extra feature query.' }
    $state = $script:FeatureStates[$script:GetCalls]
    $script:GetCalls++
    [pscustomobject]@{ FeatureName = $FeatureName; State = $state }
}
function Enable-WindowsOptionalFeature {
    [CmdletBinding()]
    param([switch]$Online, [string]$FeatureName, [switch]$All, [switch]$NoRestart)
    # Intentionally no State property: this matches the real enable result.
    $script:EnableCalls += [pscustomobject]@{ Online = [bool]$Online; FeatureName = $FeatureName;
        All = [bool]$All; NoRestart = [bool]$NoRestart }
    [pscustomobject]@{ RestartNeeded = $true }
}
function Test-Path {
    [CmdletBinding()]
    param([string]$LiteralPath, [string]$PathType)
    if ($PathType -ne 'Leaf' -or $LiteralPath -notlike '*System32\WindowsSandbox.exe') { throw 'Unexpected executable lookup.' }
    $script:ExecutableExists
}
function Restart-Computer { throw 'No test may restart Windows.' }
function Start-Process { throw 'No test may launch an elevated process.' }
function Assert-True([bool]$Value, [string]$Message) {
    if (-not $Value) { throw $Message }
}
function Reset-Stubs([string[]]$States, [bool]$ExecutableExists = $false) {
    $script:FeatureStates = $States
    $script:GetCalls = 0
    $script:EnableCalls = @()
    $script:ExecutableExists = $ExecutableExists
}

$target = Join-Path (Split-Path -Parent $PSScriptRoot) 'scripts\clean-windows-enable-sandbox.ps1'
$tokens = $null
$parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($target, [ref]$tokens, [ref]$parseErrors)
Assert-True ($parseErrors.Count -eq 0) 'Production script must parse without errors.'
$functions = @($ast.FindAll({ param($node)
    $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Invoke-MediaSlimXSandboxEnable'
}, $true))
Assert-True ($functions.Count -eq 1) 'Expected exactly one feature operation function.'
. ([scriptblock]::Create($functions[0].Extent.Text))
$passed = @()

Reset-Stubs @('Disabled', 'Enabled')
$result = Invoke-MediaSlimXSandboxEnable -Confirm:$false | ConvertFrom-Json
Assert-True ($script:EnableCalls.Count -eq 1) 'Disabled feature must call the stub exactly once.'
$call = $script:EnableCalls[0]
Assert-True ($call.Online -and $call.All -and $call.NoRestart) 'Enable must retain Online, All, and NoRestart.'
Assert-True ($call.FeatureName -eq 'Containers-DisposableClientVM') 'Only the Sandbox feature may be requested.'
Assert-True ($script:GetCalls -eq 2 -and $result.State -eq 'Enabled') 'State must come from the actual after-query.'
Assert-True ($result.RestartNeeded -eq $true -and $result.AutomaticRestart -eq $false) 'Restart request must be reported without automatic restart.'
Assert-True ($result.SandboxExecutableAvailable -eq $false) 'Missing executable must remain visible after enable.'
$passed += 'Enable uses NoRestart, reads actual after-State, preserves RestartNeeded=true, and reports absent executable.'

Reset-Stubs @('Disabled', 'EnablePending')
$result = Invoke-MediaSlimXSandboxEnable -Confirm:$false | ConvertFrom-Json
Assert-True ($result.State -eq 'EnablePending') 'An intermediate after-State must not be rewritten to Enabled.'
$passed += 'Pending after-State is reported honestly.'

Reset-Stubs @('Enabled')
$result = Invoke-MediaSlimXSandboxEnable -Confirm:$false | ConvertFrom-Json
Assert-True ($script:EnableCalls.Count -eq 0 -and $script:GetCalls -eq 1) 'Already enabled must not enable again.'
Assert-True ($null -eq $result.RestartNeeded -and $result.RestartStatus -eq 'not_reassessed') 'Already enabled must not claim no restart is needed.'
Assert-True ($result.SandboxExecutableAvailable -eq $false -and -not $result.Changed) 'Pre-restart absence must remain explicit.'
$passed += 'Already Enabled with absent executable does not enable again or guess that restart is unnecessary.'

Reset-Stubs @('Enabled') $true
$result = Invoke-MediaSlimXSandboxEnable -Confirm:$false | ConvertFrom-Json
Assert-True ($result.SandboxExecutableAvailable -eq $true -and $null -eq $result.RestartNeeded) 'Executable presence must not invent a restart assessment.'
$passed += 'Executable availability remains independent of restart assessment.'

Reset-Stubs @('Disabled')
Invoke-MediaSlimXSandboxEnable -WhatIf
Assert-True ($script:EnableCalls.Count -eq 0 -and $script:GetCalls -eq 1) 'WhatIf must not execute enable.'
$passed += 'WhatIf performs no feature mutation.'

Reset-Stubs @()
$rejected = $false
try { & $target -Confirm:$false }
catch { $rejected = $_.Exception.Message -like '*administrator*' }
Assert-True ($rejected -and $script:GetCalls -eq 0 -and $script:EnableCalls.Count -eq 0) 'Real non-admin entry must reject before querying or enabling.'
$passed += 'Non-admin production entry rejects before feature operations.'

[ordered]@{ status = 'passed'; scope = 'non-admin mocked commands; no feature changes, elevation, downloads, or restart';
    checks = $passed.Count; results = $passed } | ConvertTo-Json -Depth 3

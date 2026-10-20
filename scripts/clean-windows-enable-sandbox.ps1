# Run manually from an elevated Windows PowerShell only after approval.
# This script never elevates itself, downloads software, or restarts Windows.
[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
param()
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

function Invoke-MediaSlimXSandboxEnable {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
    param()
    $feature = Get-WindowsOptionalFeature -Online -FeatureName Containers-DisposableClientVM
    $executable = Join-Path $env:SystemRoot 'System32\WindowsSandbox.exe'
    if ($feature.State -eq 'Enabled') {
        # Enabled can be reported before a requested restart has completed.
        # Without reassessing Windows servicing state, do not claim no restart.
        [ordered]@{ Feature = $feature.FeatureName; State = [string]$feature.State; Changed = $false;
            RestartNeeded = $null; RestartStatus = 'not_reassessed'; AutomaticRestart = $false;
            SandboxExecutableAvailable = [bool](Test-Path -LiteralPath $executable -PathType Leaf);
            StatusNote = 'Already enabled; restart requirement was not reassessed. An absent executable may require a manually chosen restart.' } | ConvertTo-Json
        return
    }
    if ($PSCmdlet.ShouldProcess('This Windows installation', 'Enable Windows Sandbox; never restart automatically')) {
        $result = Enable-WindowsOptionalFeature -Online -FeatureName Containers-DisposableClientVM -All -NoRestart
        # Enable returns RestartNeeded, not a reliable State property.
        $after = Get-WindowsOptionalFeature -Online -FeatureName Containers-DisposableClientVM
        [ordered]@{ Feature = $after.FeatureName; State = [string]$after.State; Changed = $true;
            RestartNeeded = [bool]$result.RestartNeeded; AutomaticRestart = $false;
            SandboxExecutableAvailable = [bool](Test-Path -LiteralPath $executable -PathType Leaf) } | ConvertTo-Json
        if ($result.RestartNeeded) { Write-Host 'Windows requests a restart. Save your work and choose when to restart; this script will not do it.' }
    }
}

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$administrator = ([Security.Principal.WindowsPrincipal]$identity).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $administrator) { throw 'Open Windows PowerShell as administrator after approving this system change.' }
Invoke-MediaSlimXSandboxEnable @PSBoundParameters

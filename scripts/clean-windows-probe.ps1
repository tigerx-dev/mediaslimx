# Read-only prerequisite inspection. No elevation, downloads or feature changes.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$os = Get-CimInstance Win32_OperatingSystem
$computer = Get-CimInstance Win32_ComputerSystem
$features = @(Get-CimInstance Win32_OptionalFeature -Filter (
    "Name = 'Containers-DisposableClientVM' OR Name = 'Microsoft-Hyper-V-All' OR Name = 'VirtualMachinePlatform'"))
$vmInspection = 'management_module_unavailable'
$vms = @()
if (Get-Command Get-VM -ErrorAction SilentlyContinue) {
    try {
        $vms = @(Get-VM -ErrorAction Stop | Select-Object Name, State, Generation, Version)
        $vmInspection = 'readable'
    } catch { $vmInspection = 'not_accessible: ' + $_.FullyQualifiedErrorId }
}
$sandbox = $features | Where-Object { $_.Name -eq 'Containers-DisposableClientVM' }
$sandboxExecutable = Join-Path $env:SystemRoot 'System32\WindowsSandbox.exe'
[ordered]@{
    inspected_utc = [DateTime]::UtcNow.ToString('o')
    os = $os.Caption; build = $os.BuildNumber; architecture = $os.OSArchitecture
    administrator = ([Security.Principal.WindowsPrincipal]$identity).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    hypervisor_present = [bool]$computer.HypervisorPresent
    sandbox_feature_install_state = $sandbox.InstallState
    feature_state_meaning = 'Win32_OptionalFeature: 1=enabled, 2=disabled, 3=absent, 4=unknown'
    sandbox_executable_present = [bool](Test-Path -LiteralPath $sandboxExecutable)
    sandbox_can_be_launched = [bool]($sandbox.InstallState -eq 1 -and (Test-Path -LiteralPath $sandboxExecutable))
    hyper_v_inspection = $vmInspection; visible_vms = $vms
    features = @($features | Select-Object Name, InstallState)
    disk = @(Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | Select-Object DeviceID, FreeSpace, Size)
    clean_windows_test_executed = $false
} | ConvertTo-Json -Depth 6

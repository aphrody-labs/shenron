<#
.SYNOPSIS
Audits and repairs the owner Windows Bun path using only a Bun 1.4.4 build present on bun-os/main.
.DESCRIPTION
Audit is read-only. -Install copies the newest discovered 1.4.4 binary to BUN_INSTALL\bin,
repairs the user PATH and Bun executable variables, and verifies fork imports. -Machine also
cleans the machine PATH and requires an elevated PowerShell. No fallback version is accepted.
.EXAMPLE
.\scripts\ops\fix-global-paths.ps1
.EXAMPLE
.\scripts\ops\fix-global-paths.ps1 -Install -Apply
.EXAMPLE
.\scripts\ops\fix-global-paths.ps1 -Install -Apply -Machine
#>
param(
    [switch]$Apply,
    [switch]$Machine,
    [switch]$Install,
    [switch]$Verify
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$RequiredVersion = '1.4.4'
$InstallRoot = if ($env:BUN_INSTALL) { $env:BUN_INSTALL } else { Join-Path $HOME '.bun' }
$InstallBin = Join-Path $InstallRoot 'bin'
$InstalledBun = Join-Path $InstallBin 'bun.exe'

function Get-NormalizedPath([string]$Path) {
    $expanded = [Environment]::ExpandEnvironmentVariables($Path.Trim().Trim('"'))
    if (-not $expanded) { return '' }
    try { return [IO.Path]::GetFullPath($expanded).TrimEnd('\') }
    catch { return $expanded.TrimEnd('\') }
}

function Get-Version([string]$Executable) {
    if (-not (Test-Path -LiteralPath $Executable -PathType Leaf)) { return $null }
    $value = (& $Executable --version 2>$null | Out-String).Trim()
    if ($LASTEXITCODE -ne 0) { return $null }
    return $value
}

function Test-RequiredVersion([string]$Version) {
    return $Version -match '^1\.4\.4(?:$|[.+-])'
}

function Test-PublishedMain([string]$Revision) {
    $match = [regex]::Match($Revision, '(?<sha>[0-9a-f]{9,40})$')
    if (-not $match.Success) { return $false }
    $checkout = if ($env:APHRODY_BUN_CHECKOUT) { $env:APHRODY_BUN_CHECKOUT } else { 'C:\bun' }
    & git -C $checkout merge-base --is-ancestor $match.Groups['sha'].Value 'refs/remotes/bun-os/main' *> $null
    return $LASTEXITCODE -eq 0
}

function Get-FreshRuntime {
    $candidates = @()
    if ($env:BUN_BIN) { $candidates += $env:BUN_BIN }
    $candidates += 'C:\bun\build\release\bun.exe'
    $candidates += $InstalledBun
    foreach ($candidate in $candidates) {
        $path = Get-NormalizedPath $candidate
        $version = Get-Version $path
        if (Test-RequiredVersion $version) {
            & $path -e 'await import("picocolors"); await import("tiny-invariant")' *> $null
            if ($LASTEXITCODE -eq 0) {
                $revision = (& $path --revision | Out-String).Trim()
                if (Test-PublishedMain $revision) {
                    return [pscustomobject]@{ Path = $path; Version = $version; Revision = $revision }
                }
            }
        }
    }
    return $null
}

function Test-LegacyPath([string]$Path) {
    $value = Get-NormalizedPath $Path
    return $value -match '(?i)^C:\\bun\\build\\release$' -or
        $value -match '(?i)^C:\\bun\\build\\release\\bun\.exe$' -or
        $value -match '(?i)^C:\\Windows\\System32\\bun\.exe$'
}

function Get-PathEntries([string]$Value) {
    $seen = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    foreach ($entry in ($Value -split ';')) {
        $raw = $entry.Trim().Trim('"')
        if (-not $raw) { continue }
        $canonical = Get-NormalizedPath $raw
        if ($seen.Add($canonical)) { $raw }
    }
}

function Get-CleanPath([string[]]$Entries, [string]$Scope) {
    $kept = @($Entries | Where-Object { -not (Test-LegacyPath $_) })
    $normalized = @($kept | ForEach-Object { Get-NormalizedPath $_ } | Select-Object -Unique)
    if ($Scope -eq 'User') {
        return (@((Get-NormalizedPath $InstallBin)) + @($normalized | Where-Object { $_ -ine (Get-NormalizedPath $InstallBin) })) -join ';'
    }
    return $normalized -join ';'
}

function Install-Runtime([object]$Runtime) {
    if (-not $Runtime -or -not (Test-RequiredVersion $Runtime.Version)) {
        throw 'Aucun binaire Bun Aphrody 1.4.4 issu de bun-os/main disponible; installation et PATH refuses.'
    }
    New-Item -ItemType Directory -Force -Path $InstallBin | Out-Null
    $stage = Join-Path $InstallBin ".bun-stage-$([guid]::NewGuid()).exe"
    try {
        Copy-Item -LiteralPath $Runtime.Path -Destination $stage
        $stagedVersion = Get-Version $stage
        if (-not (Test-RequiredVersion $stagedVersion)) { throw "Le binaire temporaire n'est pas Bun 1.4.4: $stagedVersion" }
        & $stage -e 'await import("picocolors"); await import("tiny-invariant")' *> $null
        if ($LASTEXITCODE -ne 0) { throw 'Le binaire temporaire a echoue au smoke test Aphrody.' }
        Move-Item -LiteralPath $stage -Destination $InstalledBun -Force
        $installedVersion = Get-Version $InstalledBun
        if (-not (Test-RequiredVersion $installedVersion)) { throw "Installation Bun invalide: $installedVersion" }
    } finally {
        if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Force }
    }
    return $InstalledBun
}

$checkout = if ($env:APHRODY_BUN_CHECKOUT) { $env:APHRODY_BUN_CHECKOUT } else { 'C:\bun' }
if ($Install -or $Verify) {
    & git -C $checkout fetch bun-os '+refs/heads/main:refs/remotes/bun-os/main'
    if ($LASTEXITCODE -ne 0) { throw 'Fetch bun-os/main echoue; installation/verifications annulees.' }
}
$runtime = Get-FreshRuntime
if ($Install) {
    if (-not $runtime) { throw 'Aucun binaire Aphrody 1.4.4 issu de bun-os/main trouve; aucune modification effectuee.' }
    $runtimePath = Install-Runtime $runtime
    $Apply = $true
} else {
    $runtimePath = if ($runtime) { $runtime.Path } else { $null }
}

if (($Apply -or $Verify) -and -not $runtime) { throw 'Bun 1.4.4 qualifie introuvable; echec ferme, aucun fallback.' }

$reports = @()
foreach ($scope in @('User', 'Machine')) {
    if ($scope -eq 'Machine' -and $Machine -and $Apply -and -not ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw '--Machine exige PowerShell eleve.'
    }
    $old = [Environment]::GetEnvironmentVariable('Path', $scope)
    $entries = @(Get-PathEntries $old)
    $new = Get-CleanPath $entries $scope
    $removed = @($entries | Where-Object { Test-LegacyPath $_ })
    $oldBin = [Environment]::GetEnvironmentVariable('BUN_BIN', $scope)
    $oldBinDir = [Environment]::GetEnvironmentVariable('APHRODY_BUN_BIN_DIR', $scope)
    $bin = if ($scope -eq 'User') { $InstalledBun } else { $oldBin }
    $binDir = if ($scope -eq 'User') { $InstallBin } else { $oldBinDir }
    $scopeApply = $Apply -and ($scope -eq 'User' -or $Machine)
    if ($scopeApply -and $new -cne $old) { [Environment]::SetEnvironmentVariable('Path', $new, $scope) }
    if ($Apply -and $scope -eq 'User') {
        [Environment]::SetEnvironmentVariable('BUN_BIN', $InstalledBun, 'User')
        [Environment]::SetEnvironmentVariable('APHRODY_BUN_BIN_DIR', $InstallBin, 'User')
    }
    if ($scopeApply -and $scope -eq 'Machine') {
        if (Test-LegacyPath $oldBin) { [Environment]::SetEnvironmentVariable('BUN_BIN', $null, 'Machine') }
        if (Test-LegacyPath $oldBinDir) { [Environment]::SetEnvironmentVariable('APHRODY_BUN_BIN_DIR', $null, 'Machine') }
    }
    $reports += [pscustomobject]@{
        Scope = $scope
        Changed = ($new -cne $old) -or ($bin -cne $oldBin) -or ($binDir -cne $oldBinDir)
        Applied = [bool]$scopeApply
        Removed = $removed
        BunBin = $bin
        BunBinDir = $binDir
    }
}

if ($Verify) {
    $env:Path = @([Environment]::GetEnvironmentVariable('Path', 'User'), [Environment]::GetEnvironmentVariable('Path', 'Machine')) -join ';'
    $env:BUN_BIN = [Environment]::GetEnvironmentVariable('BUN_BIN', 'User')
    $env:APHRODY_BUN_BIN_DIR = [Environment]::GetEnvironmentVariable('APHRODY_BUN_BIN_DIR', 'User')
    $resolved = (Get-Command bun -ErrorAction Stop).Source
    if ((Get-NormalizedPath $resolved) -ine (Get-NormalizedPath $InstalledBun)) {
        throw "Le shell resout $resolved au lieu du runtime installe $InstalledBun."
    }
    $actualVersion = Get-Version $resolved
    if (-not (Test-RequiredVersion $actualVersion)) { throw "Version resolue invalide: $actualVersion" }
    "PASS: bun $actualVersion -> $resolved"
} else {
    [pscustomobject]@{
        Mode = if ($Apply) { 'apply' } else { 'audit' }
        RequiredVersion = $RequiredVersion
        Runtime = $runtimePath
        Version = if ($runtime) { $runtime.Version } else { $null }
        Revision = if ($runtime) { $runtime.Revision } else { $null }
        Scopes = $reports
        InstallCommand = "& '.\scripts\ops\fix-global-paths.ps1' -Install -Apply"
        MachineCommand = "& '.\scripts\ops\fix-global-paths.ps1' -Install -Apply -Machine # elevated PowerShell"
        VerifyCommand = "& '.\scripts\ops\fix-global-paths.ps1' -Verify"
    } | ConvertTo-Json -Depth 4
}

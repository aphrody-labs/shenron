# SPDX-License-Identifier: Apache-2.0
param(
    [ValidateSet('status','renew','probe')][string]$Action = 'status',
    [Parameter(Mandatory=$true)][string]$BunExe,
    [switch]$Apply
)
$ErrorActionPreference = 'Stop'
$store = Join-Path $env:USERPROFILE '.aphrody/auth/cloudflare'
$program = $PSScriptRoot
$profile = Join-Path $store 'shenron-r2-s3.dpapi'
$manifest = Join-Path $program 'manifest.example.json'
$runDirectory = Join-Path $env:USERPROFILE ('.aphrody/run/shenron-s3-' + [guid]::NewGuid().ToString('N'))
$priorTokenFile = $env:CLOUDFLARE_API_TOKEN_FILE
$priorQuietLogs = $env:BUN_DEBUG_QUIET_LOGS
$env:BUN_DEBUG_QUIET_LOGS = '1'
$exitCode = 1
$storeLock = $profile + '.lock'
$locked = $false
try {
    $null = New-Item -ItemType Directory -Path $storeLock
    $locked = $true
    $null = New-Item -ItemType Directory -Path $runDirectory
    $acl = Get-Acl -LiteralPath $runDirectory
    $acl.SetAccessRuleProtection($true, $false)
    $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $rule = [Security.AccessControl.FileSystemAccessRule]::new($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
    $acl.SetAccessRule($rule)
    Set-Acl -LiteralPath $runDirectory -AclObject $acl
    $tokenFile = Join-Path $runDirectory 'api-token'
    $profileFile = Join-Path $runDirectory 'profile.json'
    if (Test-Path -LiteralPath $profile) {
        $clear = [Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($profile), $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
        [IO.File]::WriteAllBytes($profileFile, $clear)
        [Array]::Clear($clear, 0, $clear.Length)
    }
    if ($Action -eq 'renew') {
        if (-not $Apply) { throw 'Renew requires explicit -Apply' }
        $clear = [Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes((Join-Path $store 'native-token.dpapi')), $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
        [IO.File]::WriteAllBytes($tokenFile, $clear)
        [Array]::Clear($clear, 0, $clear.Length)
        $env:CLOUDFLARE_API_TOKEN_FILE = $tokenFile
    }
    $arguments = @((Join-Path $program 's3-profile.ts'), $Action, '--manifest', $manifest, '--profile', $profileFile)
    if ($Apply) { $arguments += '--apply' }
    & $BunExe @arguments
    $exitCode = $LASTEXITCODE
    if ($exitCode -eq 0 -and $Action -eq 'renew') {
        $clear = [IO.File]::ReadAllBytes($profileFile)
        $protected = [Security.Cryptography.ProtectedData]::Protect($clear, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
        [IO.File]::WriteAllBytes(($profile + '.next'), $protected)
        Move-Item -LiteralPath ($profile + '.next') -Destination $profile -Force
        [Array]::Clear($clear, 0, $clear.Length)
        [Array]::Clear($protected, 0, $protected.Length)
    }
} finally {
    $env:CLOUDFLARE_API_TOKEN_FILE = $priorTokenFile
    $env:BUN_DEBUG_QUIET_LOGS = $priorQuietLogs
    if ($clear) { [Array]::Clear($clear, 0, $clear.Length) }
    $resolvedRun = [IO.Path]::GetFullPath($runDirectory)
    $allowedRun = [IO.Path]::GetFullPath((Join-Path $env:USERPROFILE '.aphrody/run')) + [IO.Path]::DirectorySeparatorChar
    if (-not $resolvedRun.StartsWith($allowedRun, [StringComparison]::OrdinalIgnoreCase)) { throw 'Temporary path escaped protected run directory' }
    if (Test-Path -LiteralPath $resolvedRun) { Remove-Item -LiteralPath $resolvedRun -Recurse -Force }
    if ($locked) { Remove-Item -LiteralPath $storeLock }
}
exit $exitCode

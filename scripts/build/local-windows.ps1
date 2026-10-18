# SPDX-License-Identifier: Apache-2.0
<#
.SYNOPSIS
  Native Windows steps of the local build. The Docker build (scripts/build/local.ts) cross-compiles
  every Windows artifact on Linux; what needs a real Windows lives here, clearly apart.

.PARAMETER Action
  doctor          toolchain and disk report (Docker, MSVC, signtool, NSIS, Rust, free space)
  smoke           run the Windows binaries of dist/local/windows-x64 natively (--version / version)
  sign            Authenticode-sign the .exe/.dll/installer of dist/local/windows-x64 (optional)
  desktop-native  build Shenron Studio on Windows itself (MSVC + Tauri NSIS), no Docker

.NOTES
  Signing is optional and never part of the Docker build. Environment (never printed, never committed):
    SHENRON_SIGN_PFX           path of the code-signing certificate (.pfx)
    SHENRON_SIGN_PFX_PASSWORD  its password
    SHENRON_SIGN_TIMESTAMP_URL RFC 3161 server (default http://timestamp.digicert.com)
  After signing, dist/local/manifest.json and SHA256SUMS are refreshed.
#>
[CmdletBinding()]
param(
  [ValidateSet('doctor', 'smoke', 'sign', 'desktop-native')][string]$Action = 'doctor',
  [string[]]$DesktopArgs = @('--skip-chat-model')
)
$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$Dist = Join-Path $Root 'dist\local'
$Win = Join-Path $Dist 'windows-x64'

function Or($a, $b) { if ($a) { $a } else { $b } }

function Find-Tool([string]$Name, [string[]]$Extra = @()) {
  $c = Get-Command $Name -ErrorAction SilentlyContinue
  if ($c) { return $c.Source }
  foreach ($p in $Extra) { $f = Get-ChildItem $p -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1; if ($f) { return $f.FullName } }
  return $null
}

function Update-Manifest {
  & bun (Join-Path $Root 'scripts/build/local.ts') refresh
  if ($LASTEXITCODE -ne 0) { throw 'manifest refresh failed' }
}

switch ($Action) {
  'doctor' {
    $drive = (Get-Item $Root).PSDrive
    "free disk $($drive.Name): {0:N1} GiB" -f ($drive.Free / 1GB)
    foreach ($t in 'docker', 'bun', 'cargo', 'git', 'gh') { "{0,-8} {1}" -f $t, (Or (Get-Command $t -ErrorAction SilentlyContinue).Source 'MISSING') }
    "signtool $(Or (Find-Tool 'signtool' @('C:\Program Files (x86)\Windows Kits\10\bin\*\x64\signtool.exe')) 'MISSING (optional)')"
    "NSIS     $(Or (Find-Tool 'makensis' @("$env:LOCALAPPDATA\tauri\NSIS\makensis.exe")) 'MISSING (Tauri downloads it on first desktop-native build)')"
    "MSVC     $(Or (Find-Tool 'link-msvc-probe' @('C:\Program Files*\Microsoft Visual Studio\*\*\VC\Tools\MSVC\*\bin\Hostx64\x64\link.exe')) 'MISSING (needed by desktop-native only)')"
    $vhd = Join-Path $env:LOCALAPPDATA 'Docker\wsl\disk\docker_data.vhdx'
    if (Test-Path $vhd) { "docker disk image: {0:N1} GiB at $vhd" -f ((Get-Item $vhd).Length / 1GB) }
  }
  'smoke' {
    if (-not (Test-Path $Win)) { throw "no Windows artifacts in $Win (run: bun scripts/build/local.ts all --target windows-x64)" }
    $checks = @{ 'shenron.exe' = '--version'; 'shenron-mcp.exe' = '--version'; 'shenron-server.exe' = 'version'; 'shenron-bot.exe' = '--smoke' }
    foreach ($exe in Get-ChildItem $Win -Recurse -Filter *.exe) {
      if (-not $checks.ContainsKey($exe.Name)) { continue }
      $out = & $exe.FullName $checks[$exe.Name] 2>&1 | Select-Object -First 3
      "{0,-22} exit {1}  {2}" -f $exe.Name, $LASTEXITCODE, ($out -join ' | ')
    }
  }
  'sign' {
    if (-not $env:SHENRON_SIGN_PFX -or -not (Test-Path $env:SHENRON_SIGN_PFX)) { throw 'SHENRON_SIGN_PFX not set: signing is optional, nothing done' }
    $signtool = Find-Tool 'signtool' @('C:\Program Files (x86)\Windows Kits\10\bin\*\x64\signtool.exe')
    if (-not $signtool) { throw 'signtool.exe not found (Windows SDK)' }
    $ts = Or $env:SHENRON_SIGN_TIMESTAMP_URL 'http://timestamp.digicert.com'
    $files = Get-ChildItem $Win -Recurse -Include *.exe, *.dll | Where-Object { $_.FullName -notmatch '\\site\\' }
    foreach ($f in $files) {
      & $signtool sign /fd SHA256 /td SHA256 /tr $ts /f $env:SHENRON_SIGN_PFX /p $env:SHENRON_SIGN_PFX_PASSWORD $f.FullName | Out-Null
      if ($LASTEXITCODE -ne 0) { throw "signing failed: $($f.Name)" }
      & $signtool verify /pa $f.FullName | Out-Null
      if ($LASTEXITCODE -ne 0) { throw "signature check failed: $($f.Name)" }
    }
    Update-Manifest
    "signed $($files.Count) files; manifest refreshed"
  }
  'desktop-native' {
    Push-Location $Root
    try { & bun scripts/build/desktop.ts --target windows-x64 @DesktopArgs; if ($LASTEXITCODE -ne 0) { throw 'desktop.ts failed' } }
    finally { Pop-Location }
  }
}

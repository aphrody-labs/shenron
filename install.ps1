# SPDX-License-Identifier: Apache-2.0
<#
.SYNOPSIS
  Installation de Shenron (dragonballfr.com) sur Windows 10/11, en un clic.

.DESCRIPTION
  1. Vérifie Windows 10/11 64 bits.
  2. Installe le runtime Microsoft Edge WebView2 s'il manque (programme officiel Microsoft).
  3. Télécharge la dernière version publiée de Shenron (GitHub Releases), vérifie son SHA-256
     contre SHA256SUMS, puis l'installe pour l'utilisateur courant (sans droits administrateur).
  4. Lance Shenron.

  Shenron embarque son propre moteur (serveur local Bun, moteur Rust) : aucun outil de
  développement n'est nécessaire.

.PARAMETER InstallerPath
  Installe un setup.exe déjà téléchargé au lieu de la dernière version publiée.

.PARAMETER Version
  Version précise à installer (ex. 1.0.0) ; par défaut la dernière version publiée.

.PARAMETER NoLaunch
  N'ouvre pas Shenron à la fin de l'installation.

.EXAMPLE
  irm https://raw.githubusercontent.com/aphrody-labs/shenron/main/install.ps1 | iex
#>
[CmdletBinding()]
param(
  [string]$InstallerPath,
  [string]$Version,
  [switch]$NoLaunch
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Repo = 'aphrody-labs/shenron'
$AppName = 'Shenron'

function Write-Step([string]$Message) { Write-Host "==> $Message" -ForegroundColor Yellow }

# 1. Windows 10/11 64 bits.
if (-not [Environment]::Is64BitOperatingSystem) { throw "$AppName nécessite Windows 64 bits." }
$build = [Environment]::OSVersion.Version.Build
if ($build -lt 17763) { throw "$AppName nécessite Windows 10 (1809) ou plus récent." }

# 2. WebView2 (déjà présent sur Windows 11 ; installé sinon).
function Test-WebView2 {
  $keys = @(
    'HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}',
    'HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}',
    'HKCU:\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}'
  )
  foreach ($key in $keys) {
    $pv = (Get-ItemProperty -Path $key -Name pv -ErrorAction SilentlyContinue).pv
    if ($pv -and $pv -ne '0.0.0.0') { return $true }
  }
  return $false
}
if (Test-WebView2) {
  Write-Step 'WebView2 est déjà installé.'
} else {
  Write-Step 'Installation de Microsoft Edge WebView2…'
  $bootstrapper = Join-Path $env:TEMP 'MicrosoftEdgeWebview2Setup.exe'
  Invoke-WebRequest -Uri 'https://go.microsoft.com/fwlink/p/?LinkId=2124703' -OutFile $bootstrapper -UseBasicParsing
  $signature = Get-AuthenticodeSignature $bootstrapper
  if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'Microsoft Corporation') {
    throw 'Le programme WebView2 téléchargé n''est pas signé par Microsoft.'
  }
  Start-Process -FilePath $bootstrapper -ArgumentList '/silent', '/install' -Wait
}

# 3. Shenron.
if (-not $InstallerPath) {
  $api = if ($Version) { "https://api.github.com/repos/$Repo/releases/tags/v$Version" } else { "https://api.github.com/repos/$Repo/releases/latest" }
  Write-Step "Recherche de la version de $AppName…"
  $release = Invoke-RestMethod -Uri $api -Headers @{ 'User-Agent' = 'shenron-install' }
  $asset = $release.assets | Where-Object { $_.name -match '_x64-setup\.exe$' } | Select-Object -First 1
  $sums = $release.assets | Where-Object { $_.name -match '^SHA256SUMS(\.txt)?$' } | Select-Object -First 1
  if (-not $asset -or -not $sums) { throw "La version $($release.tag_name) ne contient pas d'installeur Windows." }
  $InstallerPath = Join-Path $env:TEMP $asset.name
  Write-Step "Téléchargement de $($asset.name) ($([math]::Round($asset.size / 1MB)) Mo)…"
  Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $InstallerPath -UseBasicParsing
  $expected = ((Invoke-WebRequest -Uri $sums.browser_download_url -UseBasicParsing).Content -split "`n" |
      Where-Object { $_ -match [regex]::Escape($asset.name) } | Select-Object -First 1) -replace '\s.*$', ''
  $actual = (Get-FileHash -Algorithm SHA256 -Path $InstallerPath).Hash.ToLowerInvariant()
  if (-not $expected -or $actual -ne $expected.ToLowerInvariant()) {
    Remove-Item $InstallerPath -Force
    throw "Empreinte SHA-256 inattendue pour $($asset.name) : téléchargement refusé."
  }
  Write-Step 'Empreinte SHA-256 vérifiée.'
}
if (-not (Test-Path $InstallerPath)) { throw "Installeur introuvable : $InstallerPath" }
Write-Step "Installation de $AppName…"
$process = Start-Process -FilePath $InstallerPath -ArgumentList '/S' -Wait -PassThru
if ($process.ExitCode -ne 0) { throw "L'installation a échoué (code $($process.ExitCode))." }

# 4. Lancement.
$candidates = @(
  (Join-Path $env:LOCALAPPDATA "$AppName\shenron-desktop.exe"),
  (Join-Path $env:LOCALAPPDATA "Programs\$AppName\shenron-desktop.exe")
)
$exe = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $exe) { throw "$AppName est installé mais l'exécutable est introuvable." }
Write-Host "$AppName est installé : $exe" -ForegroundColor Green
if (-not $NoLaunch) { Start-Process -FilePath $exe }

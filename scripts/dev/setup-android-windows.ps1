# SPDX-License-Identifier: Apache-2.0
[CmdletBinding()]
param(
    [switch] $SkipEmulatorImage
)

$ErrorActionPreference = 'Stop'
$sdkRoot = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
$programRoot = Join-Path $env:LOCALAPPDATA 'Programs\ShenronRE'
$steamRoot = Join-Path $programRoot 'SteamCMD'
$commandLineToolsUrl = 'https://dl.google.com/android/repository/commandlinetools-win-15859902_latest.zip'
$commandLineToolsZip = Join-Path $env:TEMP 'shenron-android-commandlinetools.zip'
$steamCmdZip = Join-Path $env:TEMP 'shenron-steamcmd.zip'

function Add-UserPath([string] $PathEntry) {
    $current = [Environment]::GetEnvironmentVariable('Path', 'User')
    $entries = @($current -split ';' | Where-Object { $_ })
    if ($entries -notcontains $PathEntry) {
        [Environment]::SetEnvironmentVariable('Path', (($entries + $PathEntry) -join ';'), 'User')
    }
}

function Install-Archive([string] $Url, [string] $Archive, [string] $Destination) {
    Invoke-WebRequest -Uri $Url -OutFile $Archive
    New-Item -ItemType Directory -Force -Path $Destination | Out-Null
    Expand-Archive -LiteralPath $Archive -DestinationPath $Destination -Force
    Remove-Item -LiteralPath $Archive -Force
}

$jdk = [Environment]::GetEnvironmentVariable('JAVA_HOME', 'User')
if (-not $jdk -or -not (Test-Path (Join-Path $jdk 'bin\java.exe'))) {
    winget install --id EclipseAdoptium.Temurin.17.JDK --exact --scope user --accept-source-agreements --accept-package-agreements
    $jdk = Get-ChildItem (Join-Path $env:LOCALAPPDATA 'Programs\Eclipse Adoptium') -Directory |
        Sort-Object Name -Descending | Select-Object -First 1 -ExpandProperty FullName
}
if (-not (Test-Path (Join-Path $jdk 'bin\java.exe'))) { throw 'JDK 17 was not found after installation.' }
[Environment]::SetEnvironmentVariable('JAVA_HOME', $jdk, 'User')
$env:JAVA_HOME = $jdk
$env:Path = "$jdk\bin;$env:Path"

$cmdlineRoot = Join-Path $sdkRoot 'cmdline-tools\latest'
if (-not (Test-Path (Join-Path $cmdlineRoot 'bin\sdkmanager.bat'))) {
    $staging = Join-Path $sdkRoot 'cmdline-tools\staging'
    Install-Archive $commandLineToolsUrl $commandLineToolsZip $staging
    New-Item -ItemType Directory -Force -Path (Split-Path $cmdlineRoot) | Out-Null
    if (Test-Path $cmdlineRoot) { Remove-Item -LiteralPath $cmdlineRoot -Recurse -Force }
    Move-Item -LiteralPath (Join-Path $staging 'cmdline-tools') -Destination $cmdlineRoot
    Remove-Item -LiteralPath $staging -Recurse -Force
}

[Environment]::SetEnvironmentVariable('ANDROID_HOME', $sdkRoot, 'User')
[Environment]::SetEnvironmentVariable('ANDROID_SDK_ROOT', $sdkRoot, 'User')
$env:ANDROID_HOME = $sdkRoot
$env:ANDROID_SDK_ROOT = $sdkRoot
$sdkManager = Join-Path $cmdlineRoot 'bin\sdkmanager.bat'
$packages = @(
    'platform-tools',
    'platforms;android-37.2',
    'build-tools;37.0.0',
    'ndk;30.0.16248370',
    'cmake;4.1.2',
    'emulator'
)
if (-not $SkipEmulatorImage) { $packages += 'system-images;android-37.2;google_apis_playstore_ps16k;x86_64' }
Set-Location $env:TEMP
& $sdkManager --sdk_root=$sdkRoot @packages
if ($LASTEXITCODE -ne 0) { throw "Android SDK package installation failed: $LASTEXITCODE" }
"y`n" | & $sdkManager --sdk_root=$sdkRoot --licenses
if ($LASTEXITCODE -ne 0) { throw "Android SDK license setup failed: $LASTEXITCODE" }

@(
    (Join-Path $jdk 'bin'),
    (Join-Path $cmdlineRoot 'bin'),
    (Join-Path $sdkRoot 'platform-tools'),
    (Join-Path $sdkRoot 'emulator'),
    (Join-Path $programRoot 'bin'),
    $steamRoot
) | ForEach-Object { Add-UserPath $_ }

$apktool = Join-Path $programRoot 'bin\apktool.jar'
if (-not (Test-Path $apktool)) {
    New-Item -ItemType Directory -Force -Path (Split-Path $apktool) | Out-Null
    Invoke-WebRequest 'https://github.com/iBotPeaches/Apktool/releases/download/v3.0.3/apktool_3.0.3.jar' -OutFile $apktool
    $expected = 'dbf930b076c6b9be08d57c449cacefc3bdd6b71ebd59b3066fc0e1f5b14f9423'
    if ((Get-FileHash -Algorithm SHA256 $apktool).Hash.ToLowerInvariant() -ne $expected) {
        Remove-Item -LiteralPath $apktool -Force
        throw 'The downloaded apktool archive did not match the verified SHA-256 digest.'
    }
    @('@echo off', 'java -jar "%LOCALAPPDATA%\Programs\ShenronRE\bin\apktool.jar" %*') |
        Set-Content -LiteralPath (Join-Path $programRoot 'bin\apktool.cmd') -Encoding Ascii
}

if (-not (Test-Path (Join-Path $steamRoot 'steamcmd.exe'))) {
    Install-Archive 'https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip' $steamCmdZip $steamRoot
}

Write-Host "Android SDK: $sdkRoot"
Write-Host "SteamCMD: $(Join-Path $steamRoot 'steamcmd.exe')"
Write-Host 'Open a new terminal to load the persistent user environment.'

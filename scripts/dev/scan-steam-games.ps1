# SPDX-License-Identifier: Apache-2.0
[CmdletBinding()]
param([string] $OutputPath = 'var/reports/steam-games.json')

$ErrorActionPreference = 'Stop'

function Get-VdfValue([string] $Content, [string] $Key) {
    $match = [regex]::Match($Content, '(?m)^\s*"' + [regex]::Escape($Key) + '"\s+"([^"]*)"')
    if ($match.Success) { return $match.Groups[1].Value }
}

$roots = [System.Collections.Generic.List[string]]::new()
$steamPath = (Get-ItemProperty 'HKCU:\Software\Valve\Steam' -ErrorAction SilentlyContinue).SteamPath
if (-not $steamPath) { $steamPath = Join-Path ${env:ProgramFiles(x86)} 'Steam' }
if (Test-Path $steamPath) { $roots.Add((Resolve-Path $steamPath).Path) }

$libraryFile = Join-Path $steamPath 'steamapps\libraryfolders.vdf'
if (Test-Path $libraryFile) {
    $libraryContent = Get-Content -LiteralPath $libraryFile -Raw
    foreach ($match in [regex]::Matches($libraryContent, '(?m)^\s*"path"\s+"((?:[^"]|\\")*)"')) {
        $path = $match.Groups[1].Value -replace '\\\\', '\'
        if (Test-Path $path) { $roots.Add((Resolve-Path $path).Path) }
    }
}

$games = foreach ($root in ($roots | Select-Object -Unique)) {
    $manifests = Join-Path $root 'steamapps'
    if (-not (Test-Path $manifests)) { continue }
    foreach ($manifest in Get-ChildItem -LiteralPath $manifests -Filter 'appmanifest_*.acf' -File) {
        $content = Get-Content -LiteralPath $manifest.FullName -Raw
        $name = Get-VdfValue $content 'name'
        if ($name -notmatch '(?i)dragon\s*ball') { continue }
        $appId = Get-VdfValue $content 'appid'
        $installDir = Get-VdfValue $content 'installdir'
        if (-not $appId -or -not $installDir -or [IO.Path]::GetFileName($installDir) -ne $installDir) { continue }
        [pscustomobject]@{
            appId = [int] $appId
            name = $name
            library = $root
            installDir = Join-Path $manifests "common\$installDir"
        }
    }
}

$absoluteOutput = if ([IO.Path]::IsPathRooted($OutputPath)) {
    $OutputPath
} else {
    Join-Path (Get-Location) $OutputPath
}
New-Item -ItemType Directory -Force -Path (Split-Path $absoluteOutput) | Out-Null
@($games) | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath $absoluteOutput -Encoding utf8
Write-Host "Indexed $(@($games).Count) installed Dragon Ball title(s) to $absoluteOutput"

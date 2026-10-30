<#
.SYNOPSIS
  Frees disk space from known, ignored Shenron qualification workspaces.
.DESCRIPTION
  Safe by default: prints a plan only. With -Apply, asks for explicit confirmation,
  then removes only the three fixed, ignored report directories below and two
  identical FFmpeg archive files. It never touches Git-tracked files, databases,
  Docker data, user profiles, or arbitrary paths.
.PARAMETER Apply
  Apply the reviewed cleanup plan after a confirmation prompt.
#>
[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
param(
  [switch] $Apply
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$reportsRoot = [IO.Path]::GetFullPath((Join-Path $repoRoot 'var\reports'))
$archiveRoot = [IO.Path]::GetFullPath((Join-Path $reportsRoot 'goal-20261020'))

function Get-TreeBytes([string] $Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return [int64] 0 }
  $item = Get-Item -LiteralPath $Path -Force
  if (-not $item.PSIsContainer) { return [int64] $item.Length }
  $measure = Get-ChildItem -LiteralPath $Path -Force -Recurse -File -ErrorAction Stop |
    Measure-Object -Property Length -Sum
  if ($null -eq $measure.Sum) { return [int64] 0 }
  return [int64] $measure.Sum
}

function Assert-ContainedPath([string] $Path, [string] $Parent) {
  $fullPath = [IO.Path]::GetFullPath($Path).TrimEnd('\')
  $fullParent = [IO.Path]::GetFullPath($Parent).TrimEnd('\') + '\'
  if (-not $fullPath.StartsWith($fullParent, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing path outside the approved cleanup root: $fullPath"
  }
  return $fullPath
}

function Assert-GitIgnoredAndUntracked([string] $Path) {
  $relativePath = [IO.Path]::GetRelativePath($repoRoot, $Path).Replace('\', '/')
  $ignoredOutput = & git -C $repoRoot check-ignore --quiet -- $relativePath 2>$null
  if ($LASTEXITCODE -ne 0) { throw "Refusing non-ignored path: $relativePath" }
  $trackedOutput = & git -C $repoRoot ls-files --error-unmatch -- $relativePath 2>$null
  if ($LASTEXITCODE -eq 0) { throw "Refusing Git-tracked path: $relativePath" }
}

$approvedDirectories = @(
  (Join-Path $reportsRoot 'catalog-expansion'),
  (Join-Path $reportsRoot 'bun-video-migration-20261013'),
  (Join-Path $reportsRoot 'goal-20261020')
)
$approvedFiles = @(
  (Join-Path $archiveRoot 'ffmpeg-static.zip'),
  (Join-Path $archiveRoot 'ffmpeg-essentials.zip')
)

$plan = [Collections.Generic.List[object]]::new()
foreach ($candidate in $approvedDirectories) {
  if (-not (Test-Path -LiteralPath $candidate)) { continue }
  $path = Assert-ContainedPath $candidate $reportsRoot
  Assert-GitIgnoredAndUntracked $path
  $bytes = Get-TreeBytes $path
  if ($bytes -gt 0) {
    $plan.Add([pscustomobject]@{ Path = $path; Bytes = $bytes; Kind = 'temporary report workspace' })
  }
}

foreach ($candidate in $approvedFiles) {
  if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { continue }
  $path = Assert-ContainedPath $candidate $archiveRoot
  Assert-GitIgnoredAndUntracked $path
  $plan.Add([pscustomobject]@{ Path = $path; Bytes = (Get-TreeBytes $path); Kind = 'duplicate FFmpeg archive' })
}

$archives = @($plan | Where-Object { $_.Kind -eq 'duplicate FFmpeg archive' })
if ($archives.Count -eq 2) {
  $firstHash = (Get-FileHash -LiteralPath $archives[0].Path -Algorithm SHA256).Hash
  $secondHash = (Get-FileHash -LiteralPath $archives[1].Path -Algorithm SHA256).Hash
  if ($firstHash -ne $secondHash) { throw 'FFmpeg archive hashes differ; refusing to remove either archive.' }
}

$totalBytes = [int64] (($plan | Measure-Object -Property Bytes -Sum).Sum)
Write-Host 'Approved cleanup plan (only ignored qualification workspaces and identical archives):'
$plan | Select-Object Kind, @{Name='GiB'; Expression={[math]::Round($_.Bytes / 1GB, 2)}}, Path | Format-Table -AutoSize
Write-Host ("Potential recovery: {0:N2} GiB" -f ($totalBytes / 1GB))

if (-not $Apply) {
  Write-Host 'Dry run only. Review the paths, then run: .\scripts\ops\free-disk.ps1 -Apply'
  return
}

if ($plan.Count -eq 0) {
  Write-Host 'Nothing eligible for cleanup.'
  return
}

$answer = Read-Host 'Type DELETE to remove exactly the listed paths'
if ($answer -cne 'DELETE') {
  Write-Host 'Cancelled; no files were removed.'
  return
}

foreach ($entry in $plan) {
  if (-not $PSCmdlet.ShouldProcess($entry.Path, 'Remove approved ignored temporary data')) { continue }
  $parent = if ($entry.Kind -eq 'duplicate FFmpeg archive') { $archiveRoot } else { $reportsRoot }
  $safePath = Assert-ContainedPath $entry.Path $parent
  Assert-GitIgnoredAndUntracked $safePath
  if (Test-Path -LiteralPath $safePath) {
    Remove-Item -LiteralPath $safePath -Recurse -Force
    Write-Host ("Removed {0:N2} GiB: {1}" -f ($entry.Bytes / 1GB), $safePath)
  }
}

$drive = Get-PSDrive -Name ([IO.Path]::GetPathRoot($repoRoot).TrimEnd(':\'))
Write-Host ("Cleanup finished. Free space on {0}: {1:N2} GiB" -f $drive.Name, ($drive.Free / 1GB))

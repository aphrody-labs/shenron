[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$AuthorizedKey
)

$ErrorActionPreference = 'Stop'

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Run this script from PowerShell started with Run as administrator. It does not bypass UAC.'
}

if ($AuthorizedKey -notmatch '^ssh-(ed25519|rsa|ecdsa-sha2-[^ ]+) [A-Za-z0-9+/]+={0,3}( .*)?$') {
    throw 'AuthorizedKey must be a complete ed25519, RSA, or ECDSA SSH public key.'
}

$capability = Get-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0
if ($capability.State -ne 'Installed') {
    Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0 | Out-Null
}

$systemSid = New-Object Security.Principal.SecurityIdentifier('S-1-5-18')
$administratorsSid = New-Object Security.Principal.SecurityIdentifier('S-1-5-32-544')
$sshDirectory = Join-Path $env:USERPROFILE '.ssh'
New-Item -ItemType Directory -Path $sshDirectory -Force | Out-Null
$sshDirectoryAcl = Get-Acl $sshDirectory
$sshDirectoryAcl.SetAccessRuleProtection($true, $false)
foreach ($rule in @($sshDirectoryAcl.Access)) { [void]$sshDirectoryAcl.RemoveAccessRuleAll($rule) }
foreach ($sid in @($identity.User, $systemSid, $administratorsSid)) {
    $rule = New-Object Security.AccessControl.FileSystemAccessRule(
        $sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow'
    )
    [void]$sshDirectoryAcl.AddAccessRule($rule)
}
Set-Acl -Path $sshDirectory -AclObject $sshDirectoryAcl

$administrators = Get-LocalGroupMember -Group 'Administrators' -ErrorAction SilentlyContinue
$isAdministratorMember = $administrators | Where-Object { $_.SID -eq $identity.User.Value }
if ($isAdministratorMember) {
    $authorizedKeysPath = Join-Path $env:ProgramData 'ssh\administrators_authorized_keys'
    New-Item -ItemType File -Path $authorizedKeysPath -Force | Out-Null
    $keyAcl = Get-Acl $authorizedKeysPath
    $keyAcl.SetAccessRuleProtection($true, $false)
    foreach ($rule in @($keyAcl.Access)) { [void]$keyAcl.RemoveAccessRuleAll($rule) }
    foreach ($sid in @($systemSid, $administratorsSid)) {
        $rule = New-Object Security.AccessControl.FileSystemAccessRule($sid, 'FullControl', 'Allow')
        [void]$keyAcl.AddAccessRule($rule)
    }
    Set-Acl -Path $authorizedKeysPath -AclObject $keyAcl
} else {
    $authorizedKeysPath = Join-Path $sshDirectory 'authorized_keys'
    New-Item -ItemType File -Path $authorizedKeysPath -Force | Out-Null
    $keyAcl = Get-Acl $authorizedKeysPath
    $keyAcl.SetAccessRuleProtection($true, $false)
    foreach ($rule in @($keyAcl.Access)) { [void]$keyAcl.RemoveAccessRuleAll($rule) }
    foreach ($sid in @($identity.User, $systemSid, $administratorsSid)) {
        $rule = New-Object Security.AccessControl.FileSystemAccessRule($sid, 'FullControl', 'Allow')
        [void]$keyAcl.AddAccessRule($rule)
    }
    Set-Acl -Path $authorizedKeysPath -AclObject $keyAcl
}

$existingKeys = Get-Content -LiteralPath $authorizedKeysPath
if ($existingKeys -notcontains $AuthorizedKey) {
    Add-Content -LiteralPath $authorizedKeysPath -Value $AuthorizedKey -Encoding ascii
}

$sshdConfig = Join-Path $env:ProgramData 'ssh\sshd_config'
if (Test-Path $sshdConfig) {
    $config = Get-Content -LiteralPath $sshdConfig -Raw
    $config = [regex]::Replace($config, '(?m)^#?PubkeyAuthentication\s+\w+\s*$', 'PubkeyAuthentication yes')
    Set-Content -LiteralPath $sshdConfig -Value $config -Encoding ascii
}

Set-Service -Name sshd -StartupType Automatic
Start-Service -Name sshd

# Disable inbound TCP/22 allow rules so the scoped rule is the only SSH path.
Get-NetFirewallRule -Direction Inbound -Enabled True -Action Allow |
    Where-Object { $_.Name -ne 'Shenron-OpenSSH-WireGuard' } |
    ForEach-Object {
        $portFilter = $_ | Get-NetFirewallPortFilter
        $ports = @($portFilter.LocalPort | ForEach-Object { $_.ToString() })
        if ($portFilter.Protocol -in @('TCP', '6', 'Any') -and $ports -contains '22') {
            $_ | Disable-NetFirewallRule
        }
    }
Get-NetFirewallRule -Name 'Shenron-OpenSSH-WireGuard' -ErrorAction SilentlyContinue |
    Remove-NetFirewallRule
New-NetFirewallRule `
    -Name 'Shenron-OpenSSH-WireGuard' `
    -DisplayName 'Shenron OpenSSH from WireGuard only' `
    -Direction Inbound `
    -Action Allow `
    -Protocol TCP `
    -LocalPort 22 `
    -RemoteAddress '10.200.77.0/24' `
    -Profile Any | Out-Null

Write-Output "OpenSSH Server is active. Authorized key: $authorizedKeysPath. Firewall scope: 10.200.77.0/24."

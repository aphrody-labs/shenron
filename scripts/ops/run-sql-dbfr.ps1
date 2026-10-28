param(
    [Parameter(Mandatory=$true)]
    [string]$Sql
)

[System.IO.File]::WriteAllText("$PSScriptRoot\temp_exec.sql", $Sql, [System.Text.Encoding]::UTF8)
aphrody infra ssh copy --host dbfr "$PSScriptRoot\temp_exec.sql" /tmp/temp_exec.sql
aphrody infra ssh exec --host dbfr -c "sudo docker exec -i shenron-postgres psql -U postgres -d shenron_site -f /tmp/temp_exec.sql"
Remove-Item -Path "$PSScriptRoot\temp_exec.sql" -ErrorAction SilentlyContinue

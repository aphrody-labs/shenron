$sqlFiles = @(
  "C:\shenron\scripts\ops\seed-staff-contributors.sql",
  "C:\shenron\scripts\ops\seed-voice-actors.sql",
  "C:\shenron\scripts\ops\seed-shida-uchida-extended.sql"
)

foreach ($file in $sqlFiles) {
  Write-Host "Re-applying $file with strict UTF-8..."
  $content = [System.IO.File]::ReadAllText($file, [System.Text.Encoding]::UTF8)
  $b64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($content))
  $remoteCmd = "echo $b64 | base64 -d | sudo docker exec -i shenron-postgres psql -U postgres -d shenron_site"
  aphrody infra ssh exec --host dbfr -c $remoteCmd
}
Write-Host "Done re-applying SQL files."

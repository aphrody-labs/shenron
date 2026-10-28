$query = "SELECT slug, name, image FROM bot.contributors WHERE image LIKE '%svg%' OR image IS NULL UNION ALL SELECT slug, name, image FROM bot.db_voice_actors WHERE image LIKE '%svg%' OR image IS NULL;"
$b64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($query))
$remoteCmd = "echo $b64 | base64 -d | sudo docker exec -i shenron-postgres psql -U postgres -d shenron_site"
aphrody infra ssh exec --host dbfr -c $remoteCmd

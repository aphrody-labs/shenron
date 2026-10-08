# Script PowerShell pour Omar — Lancement du tunnel SSH vers le VPS
$vpsHost = "51.77.147.152"
$user = "ubuntu"

Write-Host "--> Lancement du tunnel vers le VPS Aphrody ($vpsHost)..." -ForegroundColor Cyan
Write-Host "Ports relayes vers 127.0.0.1 :"
Write-Host "  - 8793 : Aphrody MCP Server"
Write-Host "  - 8788 : Aphrody A2A Coordination Hub"
Write-Host "  - 8798 : LLM Gemma4"
Write-Host "  - 8799 : LLM Qwen3 Shenron Chat"
Write-Host "  - 15433: PostgreSQL"
Write-Host "  - 16379: Redis"

ssh -N -T `
  -o ServerAliveInterval=20 `
  -o ServerAliveCountMax=3 `
  -o ExitOnForwardFailure=yes `
  -L 127.0.0.1:8793:127.0.0.1:8793 `
  -L 127.0.0.1:8788:127.0.0.1:8788 `
  -L 127.0.0.1:8798:127.0.0.1:8798 `
  -L 127.0.0.1:8799:127.0.0.1:8799 `
  -L 127.0.0.1:15433:127.0.0.1:15433 `
  -L 127.0.0.1:16379:127.0.0.1:6379 `
  "$user@$vpsHost"

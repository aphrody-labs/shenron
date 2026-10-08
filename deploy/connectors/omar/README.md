# 🚀 Guide de Connexion pour Omar — MCP, A2A & LLM

Bienvenue Omar ! Ce dossier contient tout ce qu'il faut pour connecter **Codex**, **AGY (Antigravity)** et **Claude Code** sur ton PC aux infrastructures de Shenron et Aphrody.

---

## 1. Démarrer le tunnel SSH (1 clic)

Avant de lancer tes agents sur ton PC, démarre le tunnel qui relie ton PC au VPS :

### Sous Windows (PowerShell) :
```powershell
.\connect-tunnel.ps1
```

### Sous Linux / macOS / WSL :
```bash
chmod +x ./connect-tunnel.sh
./connect-tunnel.sh
```

Ce tunnel forwarde automatiquement les ports suivants sur ta machine locale (`127.0.0.1`) :
- **8793** : Aphrody MCP HTTP (outils avancés Web, Gemini, OCR, Docs)
- **8788** : Aphrody A2A Hub (coordination multi-agents)
- **8798** : LLM Gemma4 direct (2B)
- **8799** : LLM Qwen3 Shenron Chat (4B fine-tuné)
- **15433** : PostgreSQL
- **16379** : Redis

---

## 2. Configuration pour tes outils d'agent

### A. Pour Claude Code
Copie ou fusionne le fichier `.mcp.json` de ce dossier dans ton dossier de travail ou dans ton `~/.claude.json` :
```json
{
  "mcpServers": {
    "shenron-public": {
      "url": "https://dragonballfr.com/mcp"
    },
    "aphrody-tunnel": {
      "url": "http://127.0.0.1:8793/mcp",
      "headers": {
        "Authorization": "Bearer <VOTRE_JETON_APHRODY_MCP_HTTP>"
      }
    }
  }
}
```

### B. Pour Antigravity / AGY
Copie `mcp_config.json` dans `~/.gemini/antigravity-cli/mcp_config.json` ou à la racine de ton workspace :
```json
{
  "mcpServers": {
    "shenron-public": {
      "serverUrl": "https://dragonballfr.com/mcp"
    },
    "aphrody-tunnel": {
      "serverUrl": "http://127.0.0.1:8793/mcp",
      "headers": {
        "Authorization": "Bearer <VOTRE_JETON_APHRODY_MCP_HTTP>"
      }
    }
  }
}
```

### C. Pour Codex
Ajoute dans ton `.codex/config.toml` :
```toml
# Codex MCP Configuration — Shenron & Aphrody
[mcp_servers.shenron_public]
url = "https://dragonballfr.com/mcp"

[mcp_servers.aphrody_tunnel]
url = "http://127.0.0.1:8793/mcp"
http_headers = { "Authorization" = "Bearer <VOTRE_JETON_APHRODY_MCP_HTTP>" }

[features]
code_mode_host = true

```

---

## 3. Alternative sans tunnel (Mode Public Direct)
Si tu n'as pas de connexion SSH au VPS, tes agents peuvent directement utiliser :
- **Shenron MCP** : `https://dragonballfr.com/mcp` (100% public, lecture seule sans auth)
- **A2A Agent Card** : `https://dragonballfr.com/.well-known/agent-card.json`
- **A2A Coordination API** : `https://dragonballfr.com/api/a2a`

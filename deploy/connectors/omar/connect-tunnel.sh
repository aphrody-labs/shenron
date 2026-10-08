#!/bin/bash
# Script Bash pour Omar — Lancement du tunnel SSH vers le VPS
VPS_HOST="51.77.147.152"
USER="ubuntu"

echo "--> Lancement du tunnel vers le VPS Aphrody ($VPS_HOST)..."
echo "Ports relayés vers 127.0.0.1 :"
echo "  - 8793 : Aphrody MCP Server"
echo "  - 8788 : Aphrody A2A Coordination Hub"
echo "  - 8798 : LLM Gemma4"
echo "  - 8799 : LLM Qwen3 Shenron Chat"
echo "  - 15433: PostgreSQL"
echo "  - 16379: Redis"

exec ssh -N -T \
  -o ServerAliveInterval=20 \
  -o ServerAliveCountMax=3 \
  -o ExitOnForwardFailure=yes \
  -L 127.0.0.1:8793:127.0.0.1:8793 \
  -L 127.0.0.1:8788:127.0.0.1:8788 \
  -L 127.0.0.1:8798:127.0.0.1:8798 \
  -L 127.0.0.1:8799:127.0.0.1:8799 \
  -L 127.0.0.1:15433:127.0.0.1:15433 \
  -L 127.0.0.1:16379:127.0.0.1:6379 \
  "$USER@$VPS_HOST"

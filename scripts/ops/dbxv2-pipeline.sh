#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
#
# dbxv2-pipeline — End-to-end automation for Dragon Ball Xenoverse 2 (AppID 454650)
# Steam download, auto-RE with aphrody-re-suite, extraction, and Nginx CDN publication.

set -euo pipefail

APP_ID=454650
INSTALL_DIR="/home/ubuntu/games/dbxv2"
STEAMCMD="/home/ubuntu/.local/share/Steam/steamcmd/steamcmd.sh"
DBXV2_DIR="/home/ubuntu/shenron-xenoverse-map/vendor/dbxv2"
CDN_DIR="/srv/shenron-cdn/assets/xenoverse"
OUTPUT_DIR="${DBXV2_DIR}/output"

command -v "$STEAMCMD" >/dev/null 2>&1 || STEAMCMD="$(which steamcmd 2>/dev/null || echo '/home/ubuntu/.local/share/Steam/steamcmd/steamcmd.sh')"

log() {
  echo -e "\033[1;34m[DBXV2 Pipeline]\033[0m $*"
}

check_install() {
  log "Verification de l installation de Dragon Ball Xenoverse 2 - AppID $APP_ID..."
  
  local exe_found=""
  if [[ -f "${INSTALL_DIR}/DBXV2.exe" ]]; then
    exe_found="${INSTALL_DIR}/DBXV2.exe"
  elif [[ -f "${INSTALL_DIR}/steamapps/common/DB Xenoverse 2/bin/DBXV2.exe" ]]; then
    exe_found="${INSTALL_DIR}/steamapps/common/DB Xenoverse 2/bin/DBXV2.exe"
  elif [[ -f "${INSTALL_DIR}/steamapps/common/DB Xenoverse 2/DBXV2.exe" ]]; then
    exe_found="${INSTALL_DIR}/steamapps/common/DB Xenoverse 2/DBXV2.exe"
  elif [[ -f "/home/ubuntu/.local/share/Steam/steamapps/common/DB Xenoverse 2/DBXV2.exe" ]]; then
    exe_found="/home/ubuntu/.local/share/Steam/steamapps/common/DB Xenoverse 2/DBXV2.exe"
  fi

  if [[ -n "$exe_found" ]]; then
    log "DBXV2 est installe : $exe_found"
    return 0
  else
    log "DBXV2 n est pas encore installe (DBXV2.exe introuvable dans $INSTALL_DIR)."
    return 1
  fi
}

download_game() {
  local user="${1:-${STEAM_USER:-}}"
  local pass="${2:-${STEAM_PASS:-}}"
  local guard="${3:-${STEAM_GUARD:-}}"

  mkdir -p "$INSTALL_DIR"

  if [[ -z "$user" ]]; then
    log "ERREUR: Un compte Steam possedant DBXV2 est requis pour le telechargement."
    echo "Usage: dbxv2-pipeline download <steam_username> [steam_password] [steam_guard_code]"
    echo "Ou exporter STEAM_USER, STEAM_PASS, STEAM_GUARD dans l environnement."
    exit 1
  fi

  log "Lancement du telechargement SteamCMD pour AppID $APP_ID vers $INSTALL_DIR..."
  if [[ -n "$pass" && -n "$guard" ]]; then
    "$STEAMCMD" \
      +@sSteamCmdForcePlatformType windows \
      +force_install_dir "$INSTALL_DIR" \
      +login "$user" "$pass" "$guard" \
      +app_update "$APP_ID" validate \
      +quit
  elif [[ -n "$pass" ]]; then
    "$STEAMCMD" \
      +@sSteamCmdForcePlatformType windows \
      +force_install_dir "$INSTALL_DIR" \
      +login "$user" "$pass" \
      +app_update "$APP_ID" validate \
      +quit
  else
    "$STEAMCMD" \
      +@sSteamCmdForcePlatformType windows \
      +force_install_dir "$INSTALL_DIR" \
      +login "$user" \
      +app_update "$APP_ID" validate \
      +quit
  fi

  log "Telechargement termine."
  check_install
}

extract_assets() {
  log "Extraction et conversion des archives CPK..."
  mkdir -p "$OUTPUT_DIR" "$CDN_DIR"

  local game_path="$INSTALL_DIR"
  if [[ -d "${INSTALL_DIR}/steamapps/common/DB Xenoverse 2" ]]; then
    game_path="${INSTALL_DIR}/steamapps/common/DB Xenoverse 2"
  fi

  cd "$DBXV2_DIR"
  log "1. Extraction CPK via PyCriCodecsEx..."
  .venv/bin/python3 dbxv2.py extract --game "$game_path" --out "$OUTPUT_DIR" || true

  log "2. Extraction des textures (EMB -> PNG)..."
  .venv/bin/python3 dbxv2.py tex --root "${OUTPUT_DIR}/cpk/data" || true

  log "3. Extraction des modeles 3D (EMD -> JSON / GLB)..."
  .venv/bin/python3 dbxv2.py models --root "${OUTPUT_DIR}/cpk/data" || true

  log "4. Publication vers le CDN Nginx ($CDN_DIR)..."
  mkdir -p "${CDN_DIR}/models" "${CDN_DIR}/textures" "${CDN_DIR}/audio" "${CDN_DIR}/movesets"
  
  if [[ -d "${OUTPUT_DIR}/cpk/data/chara" ]]; then
    rsync -av --include="*/" --include="*.png" --include="*.glb" --include="*.json" --exclude="*" \
      "${OUTPUT_DIR}/cpk/data/chara/" "${CDN_DIR}/models/" || true
  fi

  log "Publication CDN terminee : https://cdn.dragonballfr.com/assets/xenoverse/"
}

auto_re() {
  log "Execution de la suite Auto-RE sur les binaires DBXV2 via Docker aphrody-re-suite..."
  local exe_path=""
  if [[ -f "${INSTALL_DIR}/DBXV2.exe" ]]; then
    exe_path="${INSTALL_DIR}/DBXV2.exe"
  elif [[ -f "${INSTALL_DIR}/steamapps/common/DB Xenoverse 2/DBXV2.exe" ]]; then
    exe_path="${INSTALL_DIR}/steamapps/common/DB Xenoverse 2/DBXV2.exe"
  fi

  if [[ -z "$exe_path" ]]; then
    log "Impossible d executer l auto-RE : DBXV2.exe introuvable."
    return 1
  fi

  local re_out="/home/ubuntu/re_analysis_dbxv2"
  mkdir -p "$re_out" "${CDN_DIR}/re"

  log "Lancement de Ghidra Headless (ExportFunctions, ExportSymbols, ExportStrings)..."
  /home/ubuntu/bin/re-ghidra "$exe_path" ExportFunctions.java "${re_out}/functions"
  /home/ubuntu/bin/re-ghidra "$exe_path" ExportSymbols.java "${re_out}/symbols"
  /home/ubuntu/bin/re-ghidra "$exe_path" ExportStrings.java "${re_out}/strings"

  cp -r "${re_out}"/* "${CDN_DIR}/re/" || true
  log "Analyse RE terminee et publiee sur https://cdn.dragonballfr.com/assets/xenoverse/re/"
}

case "${1:-status}" in
  status)
    check_install || true
    ;;
  download)
    shift
    download_game "$@"
    ;;
  extract)
    extract_assets
    ;;
  re|auto-re)
    auto_re
    ;;
  all)
    if check_install; then
      extract_assets
      auto_re
    else
      log "Le jeu n est pas installe. Utilisez : dbxv2-pipeline download <user> [pass] [guard]"
    fi
    ;;
  *)
    echo "Usage: dbxv2-pipeline {status|download|extract|auto-re|all}"
    exit 1
    ;;
esac

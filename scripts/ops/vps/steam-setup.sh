#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# SteamCMD helpers for the build host (vps). Install once with:  bash steam-setup.sh install
#
#   steam-login <account>           one interactive login in tmux: you type the password and the
#                                   Steam Guard code yourself; steamcmd then caches the session
#                                   (no secret is ever stored by these scripts).
#   steam-app <appid> [dir] [acct]  install/update an app in tmux with a bounded log
#                                   (default dir ~/steam/apps/<appid>, account: STEAM_ACCOUNT or
#                                   the one saved by steam-login; "anonymous" for free tools).
#   steam-status                    sessions, cached accounts and the last lines of each log.
set -euo pipefail
BIN=${HOME}/bin
STATE=${HOME}/steam
mkdir -p "$BIN" "$STATE/apps" "$STATE/logs"

install() {
  command -v steamcmd >/dev/null || sudo -n apt-get install -y -q steamcmd
  command -v tmux >/dev/null || sudo -n apt-get install -y -q tmux
  install_one steam-login
  install_one steam-app
  install_one steam-status
  echo "installed in $BIN (needs $BIN in PATH)"
}
install_one() { { echo '#!/usr/bin/env bash'; echo "exec bash '$(readlink -f "$0")' $1 \"\$@\""; } >"$BIN/$1"; chmod +x "$BIN/$1"; }

account() { cat "$STATE/account" 2>/dev/null || echo anonymous; }

login() {
  local acct=${1:?usage: steam-login <account>}
  tmux kill-session -t steam-login 2>/dev/null || true
  tmux new-session -d -s steam-login "steamcmd +login $acct +quit; echo \$? > $STATE/login.exit; read -rp 'done, press Enter'"
  echo "$acct" >"$STATE/account"
  echo "attach and enter the password/Steam Guard yourself:  tmux attach -t steam-login"
}

app() {
  local id=${1:?usage: steam-app <appid> [dir] [account]} dir=${2:-$STATE/apps/$1} acct=${3:-${STEAM_ACCOUNT:-$(account)}}
  mkdir -p "$dir"
  tmux kill-session -t "steam-$id" 2>/dev/null || true
  tmux new-session -d -s "steam-$id" \
    "timeout 14400 steamcmd +force_install_dir $dir +login $acct +app_update $id validate +quit > $STATE/logs/$id.log 2>&1; echo EXIT_CODE=\$? >> $STATE/logs/$id.log"
  echo "started: tail -f $STATE/logs/$id.log"
}

status() {
  tmux ls 2>/dev/null | grep steam || echo "no steam session"
  echo "account: $(account)"
  for f in "$STATE"/logs/*.log; do [ -e "$f" ] && { echo "== $f"; tail -n 3 "$f" | cut -c1-160; }; done
}

cmd=${1:-install}; "${cmd#steam-}" "${@:2}"

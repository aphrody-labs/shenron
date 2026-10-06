#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# SSH to the production hosts from a Claude Code cloud session: writes ~/.ssh/config aliases `vps` and
# `dbfr` from the cloud environment, never from the repository. Idempotent, tolerant (exit code 0).
#   SHENRON_SSH_KEY_B64   base64 of the private key (cloud secret)
#   SHENRON_VPS_HOST      address of the production host      SHENRON_DBFR_HOST  address of the second host
#   SHENRON_SSH_USER      login (default ubuntu)
set -u
[[ "${CLAUDE_CODE_REMOTE:-}" == "true" || "${1:-}" == "--force" ]] || exit 0
if [[ -z "${SHENRON_SSH_KEY_B64:-}" || -z "${SHENRON_VPS_HOST:-}" ]]; then
  echo "cloud-ssh: SHENRON_SSH_KEY_B64 / SHENRON_VPS_HOST absent, SSH aliases not written"
  exit 0
fi
umask 077
mkdir -p "$HOME/.ssh"
key="$HOME/.ssh/shenron_prod"
printf '%s' "$SHENRON_SSH_KEY_B64" | base64 -d >"$key" 2>/dev/null && chmod 600 "$key" || {
  echo "cloud-ssh: SHENRON_SSH_KEY_B64 is not valid base64"
  exit 0
}
user="${SHENRON_SSH_USER:-ubuntu}"
config="$HOME/.ssh/config"
touch "$config"
grep -q '# shenron-prod' "$config" 2>/dev/null || {
  {
    echo "# shenron-prod"
    echo "Host vps"
    echo "    HostName $SHENRON_VPS_HOST"
    echo "    User $user"
    echo "    IdentityFile $key"
    echo "    IdentitiesOnly yes"
    echo "    StrictHostKeyChecking accept-new"
    echo "    ServerAliveInterval 30"
    if [[ -n "${SHENRON_DBFR_HOST:-}" ]]; then
      echo "Host dbfr"
      echo "    HostName $SHENRON_DBFR_HOST"
      echo "    User $user"
      echo "    IdentityFile $key"
      echo "    IdentitiesOnly yes"
      echo "    StrictHostKeyChecking accept-new"
      echo "    ServerAliveInterval 30"
    fi
  } >>"$config"
}
chmod 600 "$config"
ssh -o BatchMode=yes -o ConnectTimeout=8 vps true 2>/dev/null && echo "cloud-ssh: vps reachable" || echo "cloud-ssh: vps unreachable (network or key)"
exit 0

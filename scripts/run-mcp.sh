#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [[ "${1:-}" == "" ]]; then
  echo "usage: $0 <config-path>" >&2
  exit 1
fi

CONFIG_PATH="$1"
shift

resolve_signing_key() {
  if [[ -n "${GIT_UNLEASH_GIT_SIGNING_KEY:-}" ]]; then
    printf '%s\n' "${GIT_UNLEASH_GIT_SIGNING_KEY}"
    return 0
  fi

  if signing_key="$(git config --get user.signingkey 2>/dev/null)" && [[ -n "${signing_key}" ]]; then
    printf '%s\n' "${signing_key/#\~/$HOME}"
    return 0
  fi

  return 1
}

ensure_ssh_auth_sock() {
  if [[ -S "${SSH_AUTH_SOCK:-}" ]]; then
    return 0
  fi

  if [[ -n "${GIT_UNLEASH_SSH_AUTH_SOCK:-}" && -S "${GIT_UNLEASH_SSH_AUTH_SOCK}" ]]; then
    export SSH_AUTH_SOCK="${GIT_UNLEASH_SSH_AUTH_SOCK}"
    return 0
  fi

  if command -v launchctl >/dev/null 2>&1; then
    local launchctl_sock
    launchctl_sock="$(launchctl getenv SSH_AUTH_SOCK 2>/dev/null || true)"
    if [[ -n "${launchctl_sock}" && -S "${launchctl_sock}" ]]; then
      export SSH_AUTH_SOCK="${launchctl_sock}"
      return 0
    fi
  fi

  return 1
}

is_inline_ssh_signing_key() {
  [[ "$1" == key::* ]]
}

normalize_ssh_public_key() {
  local key_material="$1"
  key_material="${key_material#key::}"
  printf '%s\n' "${key_material}" | awk '{ print $1 " " $2 }'
}

ensure_inline_signing_key_is_loaded() {
  local signing_key="$1"
  local normalized_key
  normalized_key="$(normalize_ssh_public_key "${signing_key}")"

  while IFS= read -r agent_key; do
    if [[ "$(normalize_ssh_public_key "${agent_key}")" == "${normalized_key}" ]]; then
      return 0
    fi
  done < <(ssh-add -L)

  cat >&2 <<EOF
Git user.signingkey is configured with inline SSH key data, but ssh-agent does not expose the same public key.

Load the matching signing key into ssh-agent before using git_commit through MCP.
EOF
  exit 1
}

if signing_key="$(resolve_signing_key)"; then
  if ! ensure_ssh_auth_sock; then
    cat >&2 <<EOF
git signing appears to be enabled for this environment, but SSH_AUTH_SOCK is not set.

Set one of these before starting Codex or registering the MCP server:
- SSH_AUTH_SOCK
- GIT_UNLEASH_SSH_AUTH_SOCK

Then retry the MCP command.
EOF
    exit 1
  fi

  if ! ssh-add -L >/dev/null 2>&1; then
    cat >&2 <<EOF
ssh-agent is reachable through SSH_AUTH_SOCK, but it is not returning any identities.

Load the signing key into ssh-agent before using git_commit through MCP.
EOF
    exit 1
  fi

  if is_inline_ssh_signing_key "${signing_key}"; then
    ensure_inline_signing_key_is_loaded "${signing_key}"
  elif [[ ! -f "${signing_key}" ]]; then
    cat >&2 <<EOF
Git user.signingkey points to '${signing_key}', but that file does not exist.

Set GIT_UNLEASH_GIT_SIGNING_KEY if you want the wrapper to validate a different key path.
EOF
    exit 1
  fi
fi

exec "${REPO_ROOT}/node_modules/.bin/tsx" "${REPO_ROOT}/src/index.ts" "${CONFIG_PATH}" "$@"

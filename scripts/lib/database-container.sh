#!/usr/bin/env bash
# Resolve only this Compose project's database. Integrated controllers can set
# PSSID_DB_CONTAINER explicitly rather than relying on a global name search.
resolve_database_container() {
  if [ -n "${PSSID_DB_CONTAINER:-}" ]; then
    printf '%s\n' "$PSSID_DB_CONTAINER"
    return
  fi
  local containers
  containers="$(docker compose ps -q mongo)" || return 1
  if [ -z "$containers" ] || [[ "$containers" == *$'\n'* ]]; then
    echo 'Expected one running mongo service in this Compose project. Set PSSID_DB_CONTAINER for an integrated controller.' >&2
    return 1
  fi
  printf '%s\n' "$containers"
}

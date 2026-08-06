#!/usr/bin/env bash
#
# Refuse a GENERIC deploy/upgrade on a host that a SITE inventory names.
#
# `make deploy` and `make upgrade` run with the default inventory (ansible.cfg
# -> inventories/local.ini). Ansible loads a group_vars/ directory only when it
# sits beside the inventory actually IN USE, so on a controller that a site
# inventory names -- umich/inventory.ini, with its group_vars/pssid_gui.yml --
# those generic targets quietly apply role defaults instead of the site's
# settings: the wrong edition, the wrong hostname, the wrong TLS mode.
#
# The one that bites hardest is pssid_gui_auth_groups. Unlike the OIDC issuer,
# client id and secret, which install.sh preserves from the existing .env, the
# group -> permission mapping has NO preservation path: it is only ever written
# from the inventory. With the site's group_vars unloaded that variable is
# empty, the mapping task is skipped, and the upgrade's `git checkout -- .`
# has already reset shared/auth-groups.config.json to the shipped placeholder.
# The placeholder still RECOGNISES the group, just at a lower level, so a
# working SSO deployment comes back read-only rather than broken -- which is
# how this check came to exist.
#
# Refuses rather than warns, because every part of that failure is quiet: the
# deploy reports success, the health check passes, and the first symptom is
# somebody unable to save. ALLOW_GENERIC=1 is the escape hatch for a host that
# genuinely wants the generic defaults.
#
# Silent no-op for everyone else: a repository with no site inventory, or a
# machine no site inventory names, exits 0 without printing anything.
#
# Usage:  bash scripts/check-site-inventory.sh <deploy|upgrade>

set -uo pipefail

# An explicit opt-out, for a host that really is meant to take role defaults.
if [ -n "${ALLOW_GENERIC:-}" ]; then
  exit 0
fi

ACTION="${1:-deploy}"

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/.." || exit 0

# Both spellings, because an inventory may name a host either way. A failure
# here (no `hostname`, no resolvable domain) leaves the value empty and the
# comparison below simply never matches, which is the right way to fail: this
# check must never block a deploy it cannot reason about.
FQDN="$(hostname -f 2>/dev/null || true)"
SHORT="$(hostname -s 2>/dev/null || hostname 2>/dev/null || true)"

MATCH_FILE=""
MATCH_HOST=""

# Site inventories sit one directory down from the repository root
# (umich/inventory.ini). ansible/inventories/*.ini is deliberately not matched
# by this glob: those ARE the generic inventories.
for inv in ./*/inventory.ini; do
  [ -f "$inv" ] || continue
  # \r is a field separator, not just space and tab: an inventory edited on
  # Windows is checked out with CRLF endings (umich/inventory.ini is, today),
  # and a line naming only a hostname would otherwise yield "host\r", which
  # matches nothing. That would make this guard fail SILENTLY -- the one
  # outcome a safety check must never have.
  while IFS=$' \t\r' read -r host _rest; do
    [ -n "$host" ] || continue
    # Skip comments and [group] headers. A commented-out host (umich's qa7) is
    # not deployed, so it must not trigger this either.
    case "$host" in
      '#'*|'['*) continue ;;
    esac
    for candidate in "$FQDN" "$SHORT"; do
      [ -n "$candidate" ] || continue
      if [ "$host" = "$candidate" ]; then
        MATCH_FILE="$inv"
        MATCH_HOST="$host"
      fi
    done
  done < "$inv"
done

# Not a site-managed host: nothing to say.
if [ -z "$MATCH_FILE" ]; then
  exit 0
fi

# ./umich/inventory.ini -> umich
SITE="$(basename "$(dirname "$MATCH_FILE")")"
INV_PATH="${MATCH_FILE#./}"

PLAYBOOK="site.yml"
[ "$ACTION" = "upgrade" ] && PLAYBOOK="upgrade.yml"

cat >&2 <<EOF

  REFUSING: this host is named in a site inventory.

    host:      $MATCH_HOST
    inventory: $INV_PATH

  'make $ACTION' uses the default inventory, so $SITE/group_vars/ is NOT
  loaded and every setting there falls back to a role default. That silently
  reverts this deployment's edition, hostname and TLS mode, and it empties
  pssid_gui_auth_groups -- which leaves the group -> permission mapping at the
  shipped placeholder and downgrades an SSO site to READ-ONLY.

  Use the site target instead:

      make $ACTION-$SITE ANSIBLE_ARGS="--limit $MATCH_HOST"

  or run the playbook against that inventory directly:

      cd ansible && ansible-playbook -i ../$INV_PATH $PLAYBOOK --limit $MATCH_HOST

  If this host really is meant to take the generic defaults:

      ALLOW_GENERIC=1 make $ACTION

EOF

exit 1

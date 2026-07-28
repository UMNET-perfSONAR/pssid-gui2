#!/bin/bash
# Structural checks that unit tests cannot express, run in CI and locally.
#
# Every check here exists because the corresponding mistake has actually been
# made in this repository and was invisible until someone hit it at runtime:
# a documentation link left pointing at a moved file, an Ansible vars file whose
# NAME silently excluded it from ever being loaded, a Makefile target referenced
# but never defined. None of these break a build or a test; they break an
# operator, at deploy time, with no error that names the cause.
#
#   bash scripts/check-repo-consistency.sh
#
# Exit 0 when everything is consistent, 1 with a per-problem report otherwise.
set -uo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/.." || exit 1

fail=0
problem() { echo "  FAIL  $*" >&2; fail=1; }
section() { echo ""; echo "== $*"; }

# Paths that are legitimately referenced but not committed: generated at deploy
# time, written by the installer, or produced by the daemon on a probe.
is_generated() {
  case "$1" in
    services/server/.env|.env|nginx.conf|nginx.local.conf) return 0 ;;
    services/server/output/*|*/pssid_config.json|*/hosts.ini) return 0 ;;
    umich/QA/SSOwithOkta.md) return 0 ;;   # gitignored operator runbook
    */node_modules/*|*/build/*|*/dist/*) return 0 ;;
  esac
  return 1
}

# ── 1. Markdown links that point at a file in this repository ────────────────
# A moved file leaves the link behind, and nothing notices until a reader
# follows it. Anchors, external URLs and mailto: are out of scope.
section "Markdown links resolve"
# The `while | while` below runs its body in a subshell, so `fail=1` set inside
# would not survive; a marker file carries the result out instead. Created fresh
# each run: a leftover from an interrupted run would otherwise report broken
# links forever, on a repository with none. mktemp rather than a fixed name in
# /tmp, so a stale or hostile file of that name cannot decide the outcome.
BROKEN_LINKS="$(mktemp "${TMPDIR:-/tmp}/repo-consistency.XXXXXX")"
trap 'rm -f "$BROKEN_LINKS"' EXIT
while IFS= read -r md; do
  # Extract the target of every [text](target) on the page.
  grep -oE '\]\([^)#][^)]*\)' "$md" 2>/dev/null | sed -E 's/^\]\(//; s/\)$//' | while IFS= read -r target; do
    case "$target" in
      http://*|https://*|mailto:*|'#'*|'') continue ;;
    esac
    target="${target%%#*}"                       # drop any #anchor
    [ -n "$target" ] || continue
    full="$(dirname "$md")/$target"
    # Normalise ../ segments without requiring the file to exist.
    full="$(printf '%s' "$full" | sed -E ':a; s#[^/]+/\.\./##; ta; s#^\./##')"
    if ! is_generated "$full" && [ ! -e "$full" ]; then
      echo "  FAIL  $md -> $target (resolves to $full, which does not exist)" >&2
      echo "broken" >> "$BROKEN_LINKS"
    fi
  done
done < <(git ls-files '*.md')
if [ -s "$BROKEN_LINKS" ]; then fail=1; fi
[ "$fail" -eq 0 ] && echo "  ok    every markdown link resolves"

# ── 2. Repo paths named in code comments and operator messages ───────────────
# A path in a runtime error message is documentation the user reads at the worst
# possible moment. When a directory is renamed these are missed, because nothing
# compiles them.
section "Repo paths referenced from source resolve"
refs="$(git ls-files '*.ts' '*.vue' '*.sh' '*.yml' 'Makefile' \
        | xargs grep -ohE '(^|[^A-Za-z0-9_./-])(QA|umich|docs|scripts|ansible|shared|services)/[A-Za-z0-9_./-]+\.(md|sh|ts|yml|json|conf)' 2>/dev/null \
        | sed -E 's/^[^A-Za-z]//' | sort -u)"
while IFS= read -r p; do
  [ -n "$p" ] || continue
  if ! is_generated "$p" && [ ! -e "$p" ]; then
    problem "referenced but missing: $p"
  fi
done <<< "$refs"
[ "$fail" -eq 0 ] && echo "  ok    every referenced repo path exists"

# ── 3. Ansible group_vars files map to a real group ──────────────────────────
# Ansible resolves group_vars/<name>.yml by GROUP NAME. A file whose name is not
# a group in the inventory beside it is silently ignored -- no warning, no error,
# the variables simply never apply. That is how a vault file holding the OIDC
# client secret can sit in the right directory and never be read.
#
# Scans the FILESYSTEM rather than the git index on purpose. The file this check
# most needs to see is an operator's own vault.yml, which is deliberately
# untracked -- `git ls-files` would never show it, making the check useless for
# the one case it exists to catch.
section "Ansible group_vars filenames match inventory groups"
while IFS= read -r gv; do
  dir="$(dirname "$gv")"                       # .../group_vars
  base="$(basename "$gv" .yml)"
  [ "$base" = "all" ] && continue              # 'all' is implicit, always valid
  root="$(dirname "$dir")"
  groups="$(cat "$root"/*.ini "$root"/inventories/*.ini 2>/dev/null \
            | grep -oE '^\[[a-zA-Z0-9_-]+\]' | tr -d '[]' | sort -u)"
  if [ -z "$groups" ]; then
    echo "  skip  $gv (no inventory beside it to check against)"
    continue
  fi
  if ! printf '%s\n' "$groups" | grep -qx "$base"; then
    problem "$gv is named for a group that no inventory defines ($(printf '%s' "$groups" | tr '\n' ' ')).
        Ansible will silently ignore it. Rename it to a real group, or move it to
        $dir/all/ (a directory, whose files apply whatever they are called)."
  fi
done < <(find . -path ./node_modules -prune -o -path '*/group_vars/*.yml' -print 2>/dev/null | sed 's#^\./##')
[ "$fail" -eq 0 ] && echo "  ok    every group_vars file names a real group"

# ── 4. Makefile targets ──────────────────────────────────────────────────────
# A name in .PHONY with no rule behind it is a target that fails only when
# someone runs it, and `make help` advertises targets from their ## comments.
section "Makefile targets are defined"
phony="$(sed -n '/^\.PHONY:/,/[^\\]$/p' Makefile | tr ' \\' '\n\n' | sed 's/^\.PHONY://' | grep -vE '^$')"
while IFS= read -r t; do
  [ -n "$t" ] || continue
  grep -qE "^${t}:" Makefile || problem ".PHONY lists '$t' but no rule defines it"
done <<< "$phony"
[ "$fail" -eq 0 ] && echo "  ok    every .PHONY target has a rule"

# ── 5. Every interface edition can actually be pulled ────────────────────────
# The client bundle has its edition compiled in, so each one needs its own image
# and tag. install.sh --pull maps --edition=default to :latest and any other
# edition to a tag of its own name; an edition with no build step in
# publish.yml therefore 404s on pull, and the installer silently falls back to
# building from source -- ~8-10 GB of Docker storage instead of ~4 GB, on the
# small-disk VM that chose --pull precisely to avoid that.
section "Every client edition is published"
editions_file="services/client/src/edition/editions.ts"
publish="./.github/workflows/publish.yml"
if [ -r "$editions_file" ] && [ -r "$publish" ]; then
  # Top-level keys of the `editions` record: two-space indented `id:` entries.
  while IFS= read -r ed; do
    [ -n "$ed" ] || continue
    # Anchored to end-of-line: the tag sits alone on its line. A looser match
    # would be satisfied by the :<edition>-sha-<commit> tag, which is an
    # immutable per-build reference, not the stable tag install.sh pulls.
    if [ "$ed" = "default" ]; then
      grep -qE "_client:latest[[:space:]]*$" "$publish" \
        || problem "edition 'default' has no :latest client image in $publish"
    else
      grep -qE "_client:${ed}[[:space:]]*$" "$publish" \
        || problem "edition '$ed' exists in $editions_file but $publish publishes no _client:${ed} image.
        install.sh --pull --edition=${ed} would 404 and fall back to a from-source build."
    fi
  done < <(grep -oE "^  [a-z0-9_-]+: \{" "$editions_file" | sed -E 's/^  //; s/: \{//')
  [ "$fail" -eq 0 ] && echo "  ok    every edition has a published image tag"
else
  echo "  skip  editions.ts or publish.yml not readable"
fi

echo ""
if [ "$fail" -eq 0 ]; then
  echo "Repository consistency: all checks passed."
else
  echo "Repository consistency: problems found (see FAIL lines above)." >&2
fi
exit "$fail"

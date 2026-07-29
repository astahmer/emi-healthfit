#!/usr/bin/env bash
# Exit 0 when ripgrep finds no matches (expected empty).
# Exit 1 when matches exist. Exit 2+ on rg errors.
# Usage: scripts/expect-no-match.sh <rg-args...>
# Example: scripts/expect-no-match.sh -n 'FIXME' apps/
set -euo pipefail
set +e
rg "$@"
status=$?
set -e
if [[ "$status" -eq 0 ]]; then
  echo "expect-no-match: unexpected matches for: $*" >&2
  exit 1
fi
if [[ "$status" -eq 1 ]]; then
  exit 0
fi
exit "$status"

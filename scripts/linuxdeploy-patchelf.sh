#!/bin/sh
# linuxdeploy honors $PATCHELF and calls `patchelf --set-rpath <rpath> <file>`.
# On aarch64, rewriting the Bun sidecar's rpath to $ORIGIN/../lib makes the
# dynamic linker abort. The GTK plugin then runs ldd again and linuxdeploy
# dies with "Failed to run ldd". Keep the rewrite only when ldd still succeeds,
# and put the original bytes back otherwise: a second patchelf call does not
# undo the damage to a Bun standalone binary.
set -eu

real_patchelf() {
  if [ -n "${LINUXDEPLOY_REAL_PATCHELF:-}" ]; then
    "$LINUXDEPLOY_REAL_PATCHELF" "$@"
  else
    command patchelf "$@"
  fi
}

if [ "${1:-}" != "--set-rpath" ] || [ "$#" -ne 3 ]; then
  # `exec` would skip the function and look up a binary named real_patchelf.
  real_patchelf "$@"
  exit $?
fi

rpath=$2
file=$3
backup=$(mktemp)
trap 'rm -f "$backup"' EXIT
cp -a -- "$file" "$backup"

status=0
real_patchelf --set-rpath "$rpath" "$file" || status=$?
if [ "$status" -ne 0 ]; then
  cp -a -- "$backup" "$file"
  exit "$status"
fi

if ldd "$file" >/dev/null 2>&1; then
  exit 0
fi

echo "linuxdeploy-patchelf: ldd failed after --set-rpath on $file; restored the original file" >&2
cp -a -- "$backup" "$file"
exit 0

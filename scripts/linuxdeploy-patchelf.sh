#!/usr/bin/env bash
# linuxdeploy honours $PATCHELF and otherwise uses the patchelf bundled next to
# its own binary. That patchelf rewrites the aarch64 Bun sidecar so the dynamic
# linker crashes on it. The GTK plugin then runs ldd again and aborts the
# AppImage. The sidecar only links libc, so an rpath is unnecessary when the
# rewritten file does not load. Other files are patched exactly as before.
set -eu

if [ -n "${PATCHELF_REAL:-}" ]; then
  real="$PATCHELF_REAL"
else
  parent="$(readlink -f "/proc/${PPID}/exe" 2>/dev/null || true)"
  bundled="$(dirname "$parent")/patchelf"
  if [ -n "$parent" ] && [ -x "$bundled" ]; then
    real="$bundled"
  elif [ -x /usr/bin/patchelf ]; then
    real=/usr/bin/patchelf
  else
    echo "linuxdeploy-patchelf: could not find a patchelf binary" >&2
    exit 1
  fi
fi

if [ "${1:-}" = "--set-rpath" ] && [ "$#" -eq 3 ]; then
  file="$3"
  base="$(basename "$file")"
  if [ "$base" = "sidecar" ] || [[ "$base" == sidecar-* ]]; then
    tmp="$(mktemp)"
    cp -a -- "$file" "$tmp"
    if "$real" --set-rpath "$2" "$tmp" && ldd "$tmp" >/dev/null 2>&1; then
      cp -a -- "$tmp" "$file"
      rm -f -- "$tmp"
      exit 0
    fi
    rm -f -- "$tmp"
    echo "linuxdeploy-patchelf: left ${file} unchanged; patchelf made it unloadable" >&2
    exit 0
  fi
fi

exec "$real" "$@"

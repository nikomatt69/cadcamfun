#!/bin/bash
# linuxdeploy 07333c6 treats every non-zero `ldd` status as fatal, and it does
# that before reading the trace. On aarch64 the dynamic loader is itself a
# NEEDED entry, so `ldd` can print a complete `lib => path` trace and still
# exit 1. That abort is reported by Tauri as "failed to run linuxdeploy".
# A trace that already resolved a library is usable. "not a dynamic executable"
# stays non-zero, because linuxdeploy uses that status to skip the file.
set -u

real=${CADCAM_LDD:-/usr/bin/ldd}
out=$("$real" "$@" 2>&1) || code=$?
code=${code:-0}
printf '%s\n' "$out"
if [ "$code" -eq 0 ]; then
  exit 0
fi
if printf '%s\n' "$out" | grep -q 'not a dynamic executable'; then
  exit "$code"
fi
if printf '%s\n' "$out" | grep -q '=>'; then
  exit 0
fi
exit "$code"

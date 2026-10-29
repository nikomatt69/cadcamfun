#!/bin/bash
# SessionStart hook for Claude Code cloud sessions: installs what CI installs
# (.github/workflows/ci.yml) so typecheck, tests and the Rust shell build work.
set -euo pipefail

# Cloud sessions only; a local checkout is set up by its owner.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# Bun, pinned to the version in package.json "packageManager".
BUN_VERSION="$(sed -n 's/.*"packageManager": *"bun@\([^"]*\)".*/\1/p' package.json)"
export PATH="$HOME/.bun/bin:$PATH"
if ! command -v bun >/dev/null 2>&1 || [ "$(bun --version)" != "$BUN_VERSION" ]; then
  curl -fsSL https://bun.sh/install | bash -s "bun-v$BUN_VERSION"
fi
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo "export PATH=\"$HOME/.bun/bin:\$PATH\"" >> "$CLAUDE_ENV_FILE"
fi

# Workspace dependencies (same lockfile CI uses).
bun install --frozen-lockfile

# Linux libraries the Tauri shell (apps/desktop/src-tauri) links against.
TAURI_DEPS=(libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf libssl-dev build-essential file)
MISSING=()
for pkg in "${TAURI_DEPS[@]}"; do
  dpkg -s "$pkg" >/dev/null 2>&1 || MISSING+=("$pkg")
done
if [ "${#MISSING[@]}" -gt 0 ] && command -v apt-get >/dev/null 2>&1; then
  SUDO=""
  [ "$(id -u)" -ne 0 ] && SUDO="sudo"
  $SUDO apt-get update -qq
  DEBIAN_FRONTEND=noninteractive $SUDO apt-get install -y -qq --no-install-recommends "${MISSING[@]}"
fi

# Rust components CI checks with (cargo fmt, clippy).
if command -v rustup >/dev/null 2>&1; then
  rustup component add clippy rustfmt >/dev/null 2>&1 || true
fi

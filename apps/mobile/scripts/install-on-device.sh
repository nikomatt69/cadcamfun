#!/usr/bin/env bash
# Builds CADCAMFUN for a connected iPhone (USB or Wi-Fi), installs it and launches it.
#   bun run --filter @cadcamfun/mobile ios:install            # the paired device named "Nikoemme"
#   DEVICE_NAME="My iPhone" bun run --filter @cadcamfun/mobile ios:install
# Needs Xcode signed in to the Apple account of the team (Xcode -> Settings -> Accounts): the provisioning profile for
# com.cadcamfun.companion is created from there. APPLE_DEVELOPMENT_TEAM defaults to the team of this Mac.
set -euo pipefail
cd "$(dirname "$0")/.."

DEVICE_NAME="${DEVICE_NAME:-Nikoemme}"
export APPLE_DEVELOPMENT_TEAM="${APPLE_DEVELOPMENT_TEAM:-5FAU2JSAM3}"
BUNDLE_ID="com.cadcamfun.companion"

# The device by name, from CoreDevice (it works over Wi-Fi: the transport is the local network).
JSON="$(mktemp)"
trap 'rm -f "$JSON"' EXIT
xcrun devicectl list devices --json-output "$JSON" >/dev/null 2>&1 || { echo "devicectl cannot list devices" >&2; exit 1; }
DEVICE_ID="$(python3 - "$JSON" "$DEVICE_NAME" <<'PY'
import json, sys
data = json.load(open(sys.argv[1]))
for d in data["result"]["devices"]:
    if d["deviceProperties"]["name"] == sys.argv[2] and d["connectionProperties"].get("pairingState") == "paired":
        print(d["identifier"]); break
PY
)"
[ -n "$DEVICE_ID" ] || { echo "No paired device named '$DEVICE_NAME'. Paired devices:" >&2; xcrun devicectl list devices >&2; exit 1; }
echo "Device: $DEVICE_NAME ($DEVICE_ID)"

bun run ios:build -- --debug --target aarch64 --export-method debugging

# The .ipa tauri exports, else the .app in the build products.
ARTIFACT="$(find src-tauri/gen/apple/build -maxdepth 3 \( -name '*.ipa' -o -name 'CADCAMFUN.app' \) -not -path '*arm64-sim*' -print | head -1)"
[ -n "$ARTIFACT" ] || { echo "The build produced no .ipa or .app for a device" >&2; exit 1; }
echo "Installing $ARTIFACT"
xcrun devicectl device install app --device "$DEVICE_ID" "$ARTIFACT"
xcrun devicectl device process launch --device "$DEVICE_ID" "$BUNDLE_ID" || echo "Installed. Unlock the phone and open CADCAMFUN (on first run: Settings -> General -> VPN & Device Management -> trust the developer)."

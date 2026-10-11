#!/bin/bash
# Installs the Release CADCAMFUN build on the connected iPhone and launches it.
# Usage: bash scripts/install-on-device.sh [path-to-.app]
set -euo pipefail

DEVICE_ID="00008130-001139683430001C"
BUNDLE_ID="com.cadcamfun.mobile"
APP="${1:-/Volumes/SSD/Development/XcodeDerivedData/Build/Products/Release-iphoneos/CADCAMFUN.app}"

echo "Installing $APP on device $DEVICE_ID"
xcrun devicectl device install app --device "$DEVICE_ID" "$APP"
echo "Launching $BUNDLE_ID"
xcrun devicectl device process launch --device "$DEVICE_ID" "$BUNDLE_ID"
echo "Done."

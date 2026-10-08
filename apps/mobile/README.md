# CADCAM FUN companion (iOS)

The phone app that pairs with a desktop CADCAM FUN, reviews its projects (history, pull requests, Actions) and talks to the
AI assistant. Design and status: `specs/13-vcs-actions-mobile.md`.

## What CI already proves

`.github/workflows/ios.yml` (macOS runner): generates the Xcode project, builds for the iOS simulator, runs a real sidecar with
the companion gateway, launches the app in an iPhone simulator with a pairing link, and asserts that the app authenticated
over pinned TLS and listed the projects. `apps/sidecar/test/companion-chat-e2e.test.ts` covers the assistant path against a
scripted model. What is **not** covered: a physical device, signing, and a real model.

## First run on your own iPhone (needs a Mac, Xcode and an Apple developer account)

1. On the Mac: `bun install`, then `rustup target add aarch64-apple-ios`.
2. `export APPLE_DEVELOPMENT_TEAM=<your 10-character team id>` (Xcode → Settings → Accounts, or developer.apple.com → Membership).
3. `bun run --filter @cadcamfun/mobile ios:init` (generates `src-tauri/gen/apple`; the CI artifact `ios-xcode-project` has the same).
4. Connect the iPhone (developer mode on), then `bun run --filter @cadcamfun/mobile ios:dev` and pick the device.
5. On the desktop: start the app, open **Settings → Mobile companion**, **Turn on**, enter the desktop's address as the phone
   reaches it (LAN IP, or a Tailscale/WireGuard address), **Show QR code**.
6. On the phone: **Scan QR code** (or paste the link). The phone pins the certificate fingerprint from the code. iOS asks once for
   local-network access: allow it.
7. Open a project → **Assistant** and ask for a change. The assistant works on an `ai/*` branch and opens a pull request; review
   and merge it from **Pull requests**. Add a model key first on the desktop (Settings → AI).

## TestFlight

`bun run --filter @cadcamfun/mobile ios:build -- --export-method app-store-connect`, then upload the `.ipa` with Xcode Organizer or
`xcrun altool`. Signing certificates and the App Store Connect record are yours to create.

## Not built

Push notifications (needs an APNs key and a notification relay), and a hosted relay for use outside a network the phone can
route to the desktop (a VPN such as Tailscale works today).

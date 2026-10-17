# CADCAMFUN companion (iOS)

The iOS companion that pairs with a desktop CADCAMFUN, reviews its projects (history, pull requests, Actions) and talks to the AI assistant — the same agent the desktop runs, steered from the phone. Design and status: `specs/13-vcs-actions-mobile.md`.

Built with **Expo SDK 57** (React Native 0.86, New Architecture): Expo Router with native tabs and form sheets, NativeWind for theming, Reanimated 4 + Gesture Handler for motion, and a local native module (`modules/companion-net`) that performs every request over **pinned TLS** — the phone accepts exactly the certificate whose SHA-256 fingerprint is in the pairing QR code, holds only a scoped device token, and can reach only the companion gateway's route allow-list.

## Layout

| Path | What it is |
| --- | --- |
| `app/` | Expo Router: boot, `connect` (pair), `pair` (deep link), `(app)` native tabs — Projects (list, detail with Overview/History/Pulls/Actions, commit diff, PR review form sheet), Assistant, Activity, Settings |
| `components/` | The design system (`ui/`), chat rows, project panels, live-connection chrome |
| `lib/` | Pairing, SSE parser, `CompanionClient` (pure, bun-tested), pinned transport, server context, theme + typography, motion tokens, haptics |
| `modules/companion-net` | Local Expo module (Swift): pinned-TLS `request` + streaming handle + `--pair-link` launch argument |
| `test/` | Pure-logic tests (pairing, SSE, client, chat log, transport) run by `bun test` — no simulator needed |

## What CI proves

`.github/workflows/ios.yml` (macOS runner): installs, typechecks and exports the iOS bundle, generates the Xcode project, builds for the simulator, boots a real sidecar with the companion gateway, launches the app in an iPhone simulator with a pairing link, and asserts — from the desktop side — that the device authenticated over pinned TLS and listed the projects. `apps/sidecar/test/companion-chat-e2e.test.ts` covers the assistant path against a scripted model. Not covered: a physical device, signing, and a real model.

## Running it

```bash
bun install                                # from the repo root
bun test apps/mobile/test                  # pure-logic tests, no device
bun run --cwd apps/mobile typecheck        # tsc
bun run --cwd apps/mobile build            # expo export → dist/ (Metro + Babel + NativeWind)
cd apps/mobile && bun ios                  # expo run:ios → dev build on the simulator
cd apps/mobile && bun ios --device         # build + install on the connected iPhone (Release below)
```

## First run on your own iPhone

1. Connect the iPhone (developer mode on, unlocked, trusted by this Mac).
2. `cd apps/mobile && bun run ios:release --device` — builds and installs a standalone Release with embedded JavaScript; no running Metro server is required. Xcode uses the configured signing team.
3. On the desktop: **Settings → Mobile companion → Turn on** (port 8443 by default), then **Show QR code**.
4. On the phone: **Scan the pairing QR code** (or paste the link). The phone pins the certificate fingerprint from the code; iOS asks once for local-network access — allow it.
5. Open a project → **✦** jumps the Assistant tab to it. The assistant works on an `ai/*` branch and opens pull requests; review and merge them from the project's Pulls tab. Add a model key first on the desktop (Settings → AI).

Outside the home network the pairing address is whatever the phone can route to the desktop as (Tailscale, WireGuard, a VPN) — the transport stays the same pinned TLS stream.

If pairing fails, check **Settings → Apps → CADCAMFUN → Local Network** on the iPhone and keep the desktop's companion gateway enabled. Scan, paste and deep links report the underlying connection error. Changes to `modules/companion-net/ios` require rebuilding and reinstalling the native app; refreshing JavaScript cannot update an installed Release's Swift bridge. Expo injects a native `Promise` only as the last `AsyncFunction` argument.

Tauri capabilities apply to desktop WebView IPC, so adding HTTP or remote-window capabilities does not open this gateway. A sandboxed macOS distribution separately needs the incoming-network server entitlement. The current direct-distribution desktop uses the Bun HTTPS listener on port 8443 and the iOS app's local-network permission.

## Design system

The UI follows the iOS system palette (light/dark via CSS variables consumed by NativeWind), Liquid Glass surfaces (`components/GlassView.tsx`, with Reduce Transparency fallbacks), size-derived typography (`lib/typography.ts`), and motion tokens expressed as response + damping (`lib/animation.ts`). Press feedback is the app-wide scale 0.97 + ink tint; sheets track the finger with velocity handoff and projected-momentum dismissal; tabs never slide. The prior Solid + Tauri implementation was replaced entirely by this Expo rebuild.

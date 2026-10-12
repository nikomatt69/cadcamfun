# Frontend clone brief (for agents porting the legacy UI)

**Goal (owner decision, non-negotiable):** the v6 frontend is a **clone of the legacy UI** in `.reference/src` — same layout, screens, routes, copy, colours, spacing, icons, animations, shortcuts, 2D/3D CAD behaviour — re-implemented in **SolidJS** on the new structure (typed `ApiClient` from `@cadcamfun/api`, Effect runtime, Bun sidecar, Tauri shell). AI is **nikcli** (`packages/ai`, see `08-ai.md`) behind the sidecar's `ai` routes; the UI never calls a model provider directly.

"Identical" is judged by looking at the two apps side by side. Read the legacy component fully before porting it: JSX structure, every Tailwind class, conditional rendering, empty/loading/error states, keyboard handling, ARIA. Do not simplify, redesign, or "improve". Port behaviour bug-for-bug unless the legacy code is plainly broken (note it in your report).

## What is already identical

- `src/styles/globals.css`, `gcode-editor.css`, `tailwind-preset.cjs`, `tailwind.config.cjs`, fonts/cursors/icons from the repo-root `public/` are copies of the legacy files. Do not restyle; use the same class names.
- Routes: `src/app/routes.tsx` has one lazy route per legacy page file (same paths). A page file is a generated `PageStub` until you port it. **Replace the page file** (`src/pages/**`); do not rename routes.

## Reading the legacy code

`.reference/` is read-only, git-ignored, never imported. Sources: `shared/components/**`, `src/pages/**`, `src/store/**` (zustand), `src/hooks/**`, `src/contexts/**`, `src/lib/**`, `src/plugins/**`, `public/locales`.

## React → Solid mapping

| Legacy | New |
| --- | --- |
| React components/hooks | Solid components; `useState` → `createSignal`; `useEffect` → `createEffect`/`onMount`/`onCleanup`; `useMemo` → `createMemo`; `useRef` → `let ref`; never destructure props |
| zustand stores (`src/store/*`) | Solid stores/signals under `shared/state/<name>.ts` with the **same action names and state shape** |
| `lucide-react`, `react-feather` | `lucide-solid` |
| `framer-motion` | `solid-motionone` (or CSS transitions when equivalent) |
| `@headlessui/react`, `@radix-ui/*`, `@nextui-org`, `@chakra-ui` | `@kobalte/core` or hand-written equivalents that render the same DOM/classes |
| `react-hot-toast` | `shared/ui/toast.tsx` (same look) |
| `react-hook-form`, `zod` | signals + Effect `Schema` (core/api schemas first) |
| `@react-three/fiber`, `drei` | plain `three` (0.180) in Solid components, as `src/viewport/view3d` does |
| `recharts`, `chart.js` | `chart.js` directly on a `<canvas>` |
| `@monaco-editor/react` | `monaco-editor` directly |
| `react-markdown` | `marked` + sanitised HTML |
| `next/router`, `next/link`, `next/image`, `next/head` | `@solidjs/router` (`useNavigate`, `A`, `useParams`, `useSearchParams`), `<img>`, `document.title` |
| `fetch('/api/...')`, SWR, hooks in `src/hooks/use*.ts` | `useApp().client` + `app.runtime.run(...)` / `useRead` / `useQuery` / `useMutation` (see `src/app/queries.ts`, `shared/state/queries.ts`); responses are decoded by the contract Schemas |
| `next-i18next` / `public/locales` | `t()` from `src/i18n` with typed keys. Add keys **only to your vertical's table** (`en.<vertical>.json`). Keep the legacy wording verbatim |
| `next-auth`/Better Auth session | the single local profile (`CurrentUser`); `signin`/`signup` pages keep their UI and drive the legacy auth routes |
| WASM modules in `hooks/wasm`, `lib/wasm` | keep behaviour with the pure TS in `packages/core` where it exists, otherwise a plain TS port |

New npm dependencies: `chart.js`, `monaco-editor`, `marked` are installed. **Do not run `bun add`/`bun install` yourself** (concurrent lockfile edits). If you need another package, list it in your final report and use a plain implementation meanwhile.

## Shared files (touch only with small `Edit` calls, re-read immediately before editing; never `Write` them)

`packages/api/src/index.ts`, `apps/sidecar/src/layers.ts`, `apps/desktop/src/app/routes.tsx`, `apps/desktop/src/i18n/index.ts`, `specs/*.md` (append your own section only). Everything else outside your vertical is read-only to you.

## Verticals and ownership

Each vertical owns the **frontend and the backend** for its pages so nothing waits on another agent.

| # | Vertical | Frontend (apps/desktop/src) | Backend (packages/api/src/groups, apps/sidecar/src) | i18n table |
| --- | --- | --- | --- | --- |
| 1 | UI kit, shell, static pages, auth, settings, profile, notifications, subscription | `components/ui`, `components/layout`, `components/auth`, `components/settings`, `components/notifications`, `components/subscription`, `app/Shell.tsx`, `components/{title-bar,status-bar,command-palette,boot-screen}.tsx`; pages `index`, `pricing`, `legal/*`, `third-party-licenses`, `404`, `500`, `offline`, `auth/*`, `settings/index`, `settings/subscription`, `profile/*` | auth leftovers (`get-session`, `signin-direct`, `signup`, `test-direct-create`, `verify-magic-link`, two-factor), `user/*`, `users/*`, `subscription(s)/*`, `webhooks/*`, `cron/*`, `push-subscription`, `desktop/*`, `app-control/*`, `download`, misc root routes | `en.shell.json` |
| 2 | Library, materials, tools, machines, components, marketplace | `components/{library,materials,tools,components,marketplace}`, pages `library`, `materials/*`, `tools/*`, `machine/*`, `components/*`, `marketplace/*` | library/material/tool/machine leftovers, `components/:id/{versions,comments,relationships}`, `marketplace/*`, `og*` routes | `en.library.json` |
| 3 | Organizations, chat, invitations, admin, analytics, plugins | `components/{organizations,chat,admin,analytics,plugins}`, pages `organizations/*`, `invitations/*`, `admin/*`, `analytics/*`, `plugins/*` | `conversation*`, `invitations/*`, `admin/*`, remaining `analytics/*`, organizations leftovers, `ml/*` | `en.org.json` |
| 4 | CAD (2D + 3D) | `components/cad`, `src/viewport/**`, `shared/state/{commands,history,editor,context}.ts` and the legacy `cadStore`/`assemblyStore`/canvas hooks, pages `cad`, `drawings/*`, `projects/*`, `screens/{cad,projects}.tsx` | drawings/projects/components leftovers | `en.cad.json` |
| 5 | CAM, simulation, production costs | `components/{cam,simulation,production-costs}`, `screens/{cam}.tsx`, `screens/costs.tsx`, pages `cam`, `toolpaths/*`, `costs` | toolpaths/production-costs leftovers (G-code generate/post/simulate via `packages/core`) | `en.cam.json` |
| 6 | AI, MCP | `components/ai`, root-level `AIChatWithMCP`, `MCP*`, `CADModelAnalyzer`, `DocumentAnalyzer` etc., `components/ai-panel.tsx`, pages `ai/*`, `mcp/*`, `settings/mcp/*` | `ai/*`, `mcp*`, `openai/*`, `websocket`, `mcp-agent` routes on top of `packages/ai` (nikcli), SSE wire format as legacy | `en.ai.json` |

If your page needs data owned by another vertical, call its endpoint through the typed client; if the endpoint does not exist yet, add the contract group yourself (small `Edit` to the shared index) and mention it in your report.

## Definition of done (per vertical)

1. Every page file of your vertical is a real screen (no `PageStub`), visually and behaviourally matching the legacy page. `apps/desktop/test/app-mount.test.ts` checks each route mounts over the real sidecar handlers; it must pass for your routes.
2. `bunx tsc -p apps/desktop/tsconfig.json`, `bunx tsc -p apps/sidecar/tsconfig.json`, `bunx tsc -p packages/api/tsconfig.json` exit 0.
3. `bun test apps/desktop apps/sidecar packages/api` passes. New backend routes follow `11-api-parity-brief.md` (same path, methods, payloads, status codes, `{ message }` bodies) with in-process HTTP tests. UI logic that can be tested without pixels (stores, reducers, tool state machines) has `bun:test` tests; screens that submit data have a mount/interaction test using `test/helpers/live-app.ts`.
4. No browser: do **not** launch Chrome/Helium/Playwright. Verification is typecheck, `bun test`, and `bun run --filter @cadcamfun/desktop build`.
5. English identifiers/comments/docs; UI copy stays as the legacy app wrote it. No `.env*` reads, no commits, no imports from `.reference/`.
6. Append a short "Done / Deviations / Not done" section for your vertical at the bottom of this file.

## Test DOM notes (happy-dom, no browser)

`test/helpers/solid-plugin.ts` (loaded by the root `bunfig.toml`) compiles `.tsx` with Babel and points Solid at its DOM build; `test/helpers/dom.ts` installs happy-dom; `test/helpers/live-app.ts` boots the whole app over the real in-process sidecar. Known happy-dom gaps: a `<tr>` as the root of a Solid template is dropped by its parser (render rows inside a `<tbody>` that is part of the same template or use divs), and WebGL does not exist (components must catch renderer creation failures, see `View3D`). Browser behaviour is the reference; do not bend a screen out of shape to satisfy the test DOM beyond that.

## Progress log (agents append below)

### CAD/assistant vertical (agent: assistant-panel + CAD toolbar)

**Done**
- Docked AI panel (spec 06 §1) is now reachable from both workspace screens: `cad/CadPage.tsx` derives `showAssistant` from `app.panelOpen()` and its canvas button toggles the shell panel; `ai/CADAssistantBridge.tsx` renders its hidden context node under `<Show when={isVisible}>` instead of the old `return <Show when={false}>` (the reason the panel never showed); `ai/AssistantPanel.tsx` gained an optional `onClose` + close button wired from `app/Shell.tsx`; `screens/cam.tsx` gained the legacy "Toggle AI Copilot" toolbar button (`Zap`/`Brain`, `aria-label="Toggle AI Copilot"`) with new keys `ai.copilot.toggle|enable|disable` in `i18n/locales/en.ai.json`. Tests: `test/assistant-panel.test.ts`.
- **Floating "CAD Tools" window** (`cad/components/FloatingToolbar.tsx`) moved from `position: fixed` in viewport coordinates to `position: absolute` inside its host surface, clamped to the host's box (drag deltas are relative to `offsetParent`, and the clamp keeps the point as-is until layout exists). Inside the shell a `fixed` window sat under the title/status bar or behind the docked AI panel, and an ancestor's `transform`/`backdrop-filter` rebased `fixed` anyway, so it could fall outside the visible canvas. `cad/CadPage.tsx` lost the extra `Motion.div` wrapper around it (its own entrance animation remains) so the containing block is the canvas panel.
- `cad/CadPage.tsx` root changed from `h-screen w-screen` to `h-full w-full`: the page is a child of `.reference-workspace-container`, and `100vw/100vh` overflowed it (horizontal scroll → content clipped on the left when the AI panel is open; the CAD status bar pushed under the shell status bar). Test: `test/cad-floating-toolbar.test.ts` (2 tests: absolute positioning inside the `relative rounded-2xl` canvas host, no `.h-screen.w-screen` box, wrench button hides/restores the window).

**Deviations**
- The reference renders `FloatingToolbar` with `initialPosition={{x:100,y:100}}` on `position: fixed` over a full-screen page; the port keeps the same default offset but resolves it against the canvas host, because v6 renders the page inside a shell with chrome around it. Behaviour (draggable, collapsible, modes, buttons) is unchanged.
- The reference's CAD page is `100vw/100vh`; the port fits the shell container instead. Layout inside the page is unchanged.

**Not done (this pass)**
- Toolpath generator / CAM page parity with `.reference` and the AI-context payload (CAD + G-code + virtual toolpath) are tracked separately; nothing in this pass touched `packages/core` or `ai/store.ts`.


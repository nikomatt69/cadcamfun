# Rehearsal: desktop Stageshow scenes

Skill: benjitaylor/skills `stageshow`, ported to Solid (the kit is React; the app is SolidJS), so the
principles and the filming loop are kept, the kit code is not.

Gold: `hero-demo` / `static-card` for framing (a full-bleed strip across the head of a card, no plate, a
crop that puts the eye on the story), `loading` for the skeleton, `presence` for the cursor-per-story rule.

## Where the scenes live

| File | Scenes |
|---|---|
| `previews.tsx` | CAD, CAM, projects, library, connect, assistant, lost (404/500/offline) |
| `scenes-account.tsx` | sign-in/up, one-time code, waitlist, pricing, chat |
| `scenes-cad.tsx` | explorer, drawing sheet, PMI |
| `scenes-cam.tsx` | verify, cost, trend |
| `scenes-system.tsx` | phone pairing, update, background tasks |
| `scenes-pages.tsx` | analytics, timeline, history, document, passkeys, sessions, feature flags |

Used by: dashboard module cards, `StageEmpty` (`preview` prop), `StageLoading`/`LoadingState` (skeleton rows),
404/500/offline, the assistant's empty thread, project detail tabs, auth/billing/profile/org screens, CAD
explorer/drawing/PMI panels, CAM verify/cost, analytics, companion, update prompt, background tasks.

Reuse pass (no new artwork): `ModulePreview` gained a `lost` kind so `StageEmpty preview="lost"` covers
not-found states — manuals search, organization not-found, project not-found (the `/manuals`,
`/organizations/:id` and `/projects/:id` routes delegate to those screens). The MCP settings empty
(`/settings/mcp`) frames the existing `ConnectPreview` over its real text, matching the analytics
empty-state framing and the MCP directory's `preview="connect"`. Deferred by roadmap ownership:
project-history scenes (WP11) and a CAD/CAM job tour (WP7 viewport) wait for their RM steps.

## Beats

Each scene is one cause and one effect, 5–7 s, phases listed beside its cursor poses in the source. The
last phase is the reset beat (the scene fades, the loop restarts with a visible cause). `poster` is the
resting frame: it is what reduced-motion users, first paint and a screenshot show.

## Captured

- Headless Chromium (Playwright) screenshots of the harness pages: light theme for every scene, dark
  theme for the dashboard scenes (CAD, CAM, projects, lost). Width 360 design px, shown at 1:1 and 2x.
- Frames read: poster, one mid-story frame, one reset frame for the first seven scenes.
- Fixed from the frames: cursor over the CAM time chip, cursor touching a bar in the projects list,
  G-code line touching the chip, assistant bubble wrapping to two lines, connect nodes too small.

## Craft pass (the real UI, not the scenes)

Greps over every `.tsx`/`.css`, fixes in code, per area (reports per agent in the commit log):
decorative blue-violet-pink gradients flattened (33 in `styles/`, more in features), `transition-all` and
scale hovers removed, spinners guarded or replaced by skeleton rows, stock sparkle icons replaced,
`type=number` fields moved to `NumberField`, tabular numerals on numeric cells, tight insets widened,
one global reduced-motion rule for ambient loops (spinners keep turning).

## Assumptions

- The scenes are decorative: `aria-hidden`, no text a screen reader needs; the page around them says it.
- Sample content (a part name, a prompt, G-code, a dimension) is illustration content, marked `// i18n-ok`.
- Colours come from the app's `--ent-*` tokens with fallbacks, so light/dark need no second drawing.

## Not checked

- No film of every scene's full loop; the loop seam was read on the first seven scenes only.
- The page-level scenes have not yet been filmed in their actual hosts, dark theme or narrow layouts.
- Dark theme of the account, CAD, CAM and system scenes; the narrow side panels (~280 px) in the real app.
- The scenes inside the running Tauri app (WKWebView): `offset-path` on the CAM tool dot is verified in
  Chromium only.
- The reuse-pass slots above (manuals, org/project not-found, MCP settings) were checked by typecheck and
  the stageshow test only; they inherit the dark/narrow/WKWebView gaps above and were not filmed.
- Icon-size consistency and hover shapes were not re-audited across ~70 CAD and ~100 CAM files.
- Gradient flattening was checked by grep and by eye on the dashboard, not on every screen it touches.

## Feature pass 2026-11-03 (every component and page under `src/features`)

Scope: all 232 `.tsx` and `.css` files under `features/` plus the shared CSS they use (`styles/*.css`), read
against `craft.md` by three agents on disjoint features, then re-read in a second pass; follow-ups closed the
portalled dialogs, the CAM palette and the shared layer. Rule for the whole pass: tune values, never change
markup, classes, props or behaviour. About 60 commits, `style(desktop): stageshow ...`.

### What changed

- Spacing and type: 12px insets on words, 12/8px row padding, 4/8/12 scale, nothing under 11px, sentence case in
  place of uppercase and tracking, tabular numerals on numbers, 28px controls, fixed boxes `flex: none`.
- Icons: unicode glyphs and emoji in rows replaced by the app's lucide set, one size per area; the CAM strategy
  and cycle glyphs (the product's own icon file) share one 24 grid, stroke 2, `currentColor`.
- Colour and surfaces: legacy Tailwind palettes mapped to `--ent-*` / `--panel-*` tokens (also inside portalled
  dialogs now), decorative gradients, glows, blur and translucent overlaps made opaque, status colours only for status.
- Motion: entrance animations, scale hovers and presses removed, ambient loops respect reduced motion.
- Fields: more numeric inputs on `NumberField`; icon-led search fields keep their `pl-*` padding under the page-wide
  control rule; labels and long names no longer break mid-word.
- Text: the `ToolRow` tool-view table now goes through `t()` (`ai.toolView.*`, 12 languages).

### Gold used

`static-card` / `hero-demo` framing for the scenes, `loading` for skeleton rows, `ai-chat` / `ai-cards` for the
assistant thread. The real screens are not stage illustrations, so only the craft rules (restraint, type, spacing,
icons, colour) apply to them; framing and motion rules apply to the scenes.

### Checked

- Typecheck clean; full `apps/desktop/test` (175 files, `--timeout 60000`) and `apps/desktop/src` green.
- Headless Chromium on the Vite dev server (sidecar "Fake API"): the seven page scenes light and dark; CAD and CAM
  dark 1280; one portalled dialog (Import Drawing) light and dark; every static route dark 1280 and light 390, and
  ten main routes light 1280 and dark 390, with automated checks for icon/text overlap, buttons wrapping, mid-word
  breaks, horizontal overflow and page errors. Defects found that way were fixed (search lens, wrapping labels).

### Not checked

- The running Tauri app (WKWebView): nothing here was seen in it.
- Not every route in every theme/width combination; no real data (the fake sidecar returns empty or error states).
- Dialogs other than Import Drawing; hover, focus and pressed states by eye.
- Non-English rendering of the new `ai.toolView.*` rows (plural forms were spot-checked in code only).

### Left on purpose

- About 20 hand-drawn CAM strategy/cycle glyphs (`StrategyPalette`, `MachineCycleIcons`): domain shapes with no
  equivalent in any icon set; they are the product's own icon file, made consistent rather than replaced.
- About 370 English literals in `.ts` data files (property field labels, custom-element templates, predefined
  libraries, manuals catalogue, assistant tool and suggestion text): not component code; they need their own
  translation pass.
- `hi/ai.json` still has older keys in English.

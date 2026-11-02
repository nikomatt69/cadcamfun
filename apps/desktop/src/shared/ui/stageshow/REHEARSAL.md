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

Used by: dashboard module cards, `StageEmpty` (`preview` prop), `StageLoading`/`LoadingState` (skeleton rows),
404/500/offline, the assistant's empty thread, project detail tabs, auth/billing/profile/org screens, CAD
explorer/drawing/PMI panels, CAM verify/cost, analytics, companion, update prompt, background tasks.

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
- Dark theme of the account, CAD, CAM and system scenes; the narrow side panels (~280 px) in the real app.
- The scenes inside the running Tauri app (WKWebView): `offset-path` on the CAM tool dot is verified in
  Chromium only.
- Icon-size consistency and hover shapes were not re-audited across ~70 CAD and ~100 CAM files.
- Gradient flattening was checked by grep and by eye on the dashboard, not on every screen it touches.

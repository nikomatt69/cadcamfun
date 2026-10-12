# Desktop source layout

Read `specs/06-desktop-ui.md` ("Folder roles") for the rules. In short:

- `app/`: shell, route table (`routes.tsx`), API client and global services.
- `pages/`: one-line route adapters. No logic.
- `features/<name>/`: one folder per product area. Inside: `screens/`, `components/`, `hooks/`, `lib/` (pure logic), `store/`, `types/`, `api/`, `styles/`, only when needed.
- `shared/`: code used by several features: `ui/`, `components/`, `state/`.
- `styles/`: global stylesheets. Feature CSS lives in `features/<name>/styles/`.
- `viewport/`: 2D and 3D engine (see `viewport/README.md`). `i18n/`: translation tables. `testing/`: fake API and core-flow tests.

Imports between features go through their public files. Shared code moves to `shared/` once a second feature needs it.

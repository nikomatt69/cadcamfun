# The translation tables

`locales/<code>/<vertical>.json` holds the strings of one language, one file per
vertical (the area of the app that owns them). English (`locales/en/`) is the
source: its keys are the keys of the app, and every other language is a pack
beside it with the same keys.

- `registry.ts` — the shipped languages: code, name, name in the language itself
  and the writing direction.
- `packs.ts` — the English table and the loaders of the other languages. The
  imports are literal, so the bundler splits every language into its own chunk
  and a reader pays only for the language they picked.
- `index.ts` — the runtime: `t()`, the current language, the switch that loads a
  pack and the direction of the document.

## Rules

- A key that lives in two verticals is not an error — the later file wins — but it
  is drift, so the assistant namespaces (`ai.*`, `mcp.*`) are checked to be
  unambiguous.
- A value may carry `{placeholder}` slots. A translation keeps the same slots, in
  the same places: a pack that loses one shows a gap in the interface.
- A key that English does not have is not shown: `t()` answers the key itself, so
  a missing string is visible in the interface instead of silently empty.

## Adding a language

1. Add the language to `registry.ts` (code, English name, name in the language,
   direction).
2. Copy `locales/en/` to `locales/<code>/` and translate the values; the keys
   stay as they are.
3. Add the loader of the language to `packs.ts` (the imports of its verticals).
4. Run `bun test apps/desktop/test/i18n-tables.test.ts` — it checks that the pack
   has the keys of English, that the placeholders survived and that no string is
   empty.

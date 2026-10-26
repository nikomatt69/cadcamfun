/**
 * Palette helpers for the shell (spec 06-desktop-ui.md §1).
 *
 * The shortcuts themselves - the catalog, the user's keymap and the keyboard listener - live in
 * `shared/keybindings`; this file keeps only the text filter the command palette uses.
 */

/** Filters the palette list by a free-text query, case-insensitively. */
export const filterCommands = <T extends { readonly label: string }>(
  commands: ReadonlyArray<T>,
  query: string
): ReadonlyArray<T> => {
  const needle = query.trim().toLowerCase()
  if (needle.length === 0) return commands
  return commands.filter((command) => command.label.toLowerCase().includes(needle))
}

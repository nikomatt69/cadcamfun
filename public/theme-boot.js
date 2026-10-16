/* Applies the persisted theme before the first paint so a dark-mode window
   never flashes light.
   Mirrors STORAGE_KEY + applyTheme() in
   apps/desktop/src/shared/state/settings.ts — only the `theme` field matters
   here. External file on purpose: the production CSP allows 'self' scripts
   only, so this cannot be inlined in index.html. */
(function () {
  try {
    var theme = "system"
    var raw = localStorage.getItem("cadcamfun.settings")
    if (raw) {
      var stored = JSON.parse(raw)
      if (stored && (stored.theme === "light" || stored.theme === "dark" || stored.theme === "system")) {
        theme = stored.theme
      }
    }
    var dark = theme === "dark" ||
      (theme === "system" && typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches)
    document.documentElement.classList.toggle("dark", dark)
    document.documentElement.dataset.theme = theme
  } catch (error) {
    /* Corrupt or unavailable storage: the app re-applies the theme after boot. */
  }
})()

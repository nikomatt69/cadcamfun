import { useEffect, useState } from "react"

export type SiteTheme = "light" | "dark"

const read = (): SiteTheme =>
  typeof document !== "undefined" && document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light"

/**
 * The site's theme (`data-theme` on <html>), followed live so a stage never
 * disagrees with the page around it. Server render and first paint are light.
 */
export function useSiteTheme(): SiteTheme {
  const [theme, setTheme] = useState<SiteTheme>("light")
  useEffect(() => {
    setTheme(read())
    const observer = new MutationObserver(() => setTheme(read()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] })
    return () => observer.disconnect()
  }, [])
  return theme
}

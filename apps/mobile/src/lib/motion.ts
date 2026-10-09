/**
 * Apple-flavoured motion helpers, all on top of WAAPI so they run on the compositor (off the main
 * thread) and stay interruptible. The cubic-bézier curves below are the ones Apple actually ships:
 * - ease-out   for everything that enters or responds to a tap (snappy start)
 * - ease-in-out for on-screen motion (natural accel/decel)
 * - drawer     for sheets/modals (slow start, fast arrival — feels like material rising)
 */
export const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)"
export const EASE_IN_OUT = "cubic-bezier(0.77, 0, 0.175, 1)"
export const EASE_DRAWER = "cubic-bezier(0.32, 0.72, 0, 1)"

export const SPRING_PRESS = { duration: 160, easing: EASE_OUT } as const
export const SPRING_PRESENT = { duration: 320, easing: EASE_OUT } as const
export const SPRING_DISMISS = { duration: 240, easing: EASE_IN_OUT } as const
export const SPRING_SHEET = { duration: 380, easing: EASE_DRAWER } as const

const reduceMotion = (): boolean =>
  typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches

const target = (el: Element | Element[] | null | undefined): Element[] =>
  el instanceof Element ? [el] : Array.isArray(el) ? el : []

/** Materialise: surface grows from `0.95` + `opacity: 0` to full + opaque (never from `scale(0)`). */
export const present = (el: Element | Element[] | null): Animation[] => {
  const t = target(el)
  if (t.length === 0) return []
  if (reduceMotion()) {
    t.forEach((e) => {
      e.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, fill: "forwards", easing: EASE_OUT })
    })
    return []
  }
  return t.map((e) =>
    e.animate(
      [{ opacity: 0, transform: "scale(0.95)" }, { opacity: 1, transform: "scale(1)" }],
      { ...SPRING_PRESENT, fill: "both" },
    ),
  )
}

/** Dismiss: surface fades and shrinks back. Faster than present so the user feels the system responding. */
export const dismiss = (el: Element | Element[] | null): Animation[] => {
  const t = target(el)
  if (t.length === 0) return []
  if (reduceMotion()) {
    t.forEach((e) => {
      e.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: "forwards", easing: EASE_IN_OUT })
    })
    return []
  }
  return t.map((e) =>
    e.animate(
      [{ opacity: 1, transform: "scale(1)" }, { opacity: 0, transform: "scale(0.96)" }],
      { ...SPRING_DISMISS, fill: "both" },
    ),
  )
}

/** A sheet arriving from the bottom; the underlying page also dims for spatial continuity. */
export const sheetIn = (el: Element | null, scrim: Element | null): void => {
  if (!el) return
  if (reduceMotion()) {
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, fill: "forwards", easing: EASE_OUT })
    scrim?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, fill: "forwards", easing: EASE_OUT })
    return
  }
  el.animate(
    [{ transform: "translateY(100%)", opacity: 0.6 }, { transform: "translateY(0)", opacity: 1 }],
    { ...SPRING_SHEET, fill: "both" },
  )
  scrim?.animate([{ opacity: 0 }, { opacity: 1 }], { ...SPRING_SHEET, fill: "both" })
}

/** Sheet closing back along the same path it came from (spatial consistency, §7). */
export const sheetOut = (el: Element | null, scrim: Element | null): Promise<void> => {
  if (!el) return Promise.resolve()
  const anims: Animation[] = []
  if (reduceMotion()) {
    anims.push(el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: "forwards", easing: EASE_IN_OUT }))
  } else {
    anims.push(
      el.animate(
        [{ transform: "translateY(0)" }, { transform: "translateY(100%)" }],
        { duration: 260, easing: EASE_DRAWER, fill: "both" },
      ),
    )
  }
  if (scrim) anims.push(scrim.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: "forwards", easing: EASE_IN_OUT }))
  return Promise.all(anims.map((a) => a.finished.catch(() => {}))).then(() => undefined)
}

/** Tab cross-fade: opacity only (no position changes), matches Apple's `TabView` page swap. */
export const tabSwap = (el: Element | null): void => {
  if (!el) return
  el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: EASE_OUT, fill: "both" })
}
/** The avoiding view fills its measured parent, so its local origin is zero, not the window's origin. */
export function chatKeyboardOffset(containerWindowY: number): number {
  return Number.isFinite(containerWindowY) ? containerWindowY : 0
}

/**
 * Compatibility facade for the CAD/CAM toast call sites.
 *
 * The single toast implementation lives in `feedback.tsx` (bottom-right
 * `.ui-toast` cards: design-system styling, tone icons, close button). This
 * module keeps the older `react-hot-toast`-style API working — `toast("...")`,
 * `toast.success(...)`, `toast.error(...)`, `toast.dismiss(id)` — so those
 * call sites render in the same viewport as every other screen instead of a
 * second, top-centre one.
 */
import { toast as feedback } from "./feedback.tsx"

/** `react-hot-toast`-style facade over the shared toast store. */
export const toast = Object.assign(
  (message: string): number => feedback.info(message),
  {
    success: (message: string): number => feedback.success(message),
    error: (message: string): number => feedback.error(message),
    info: (message: string): number => feedback.info(message),
    warn: (message: string): number => feedback.warn(message),
    dismiss: (id: number): void => feedback.dismiss(id)
  }
)

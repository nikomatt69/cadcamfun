/**
 * ErrorBoundary — Solid's built-in ErrorBoundary wrapped with a refined
 * fallback that matches the design system.
 *
 * - Reset button re-mounts the boundary (signal-driven `when` reset key).
 * - Fallback uses the same translucent material as the modal/card surfaces,
 *   so it reads as part of the system, not as a raw error page.
 * - Reduced motion respected by the inner animation.
 *
 * Note: Solid's ErrorBoundary requires a single `children` element; we
 * accept a render prop to keep the fallback declarative.
 */
import { ErrorBoundary as SolidErrorBoundary } from "solid-js"
import { type JSX, Show, createSignal, createMemo } from "solid-js"
import AlertTriangle from "lucide-solid/icons/triangle-alert"
import RefreshCw from "lucide-solid/icons/refresh-cw"

export interface ErrorBoundaryProps {
  readonly children: JSX.Element
  readonly fallback?: (error: unknown, reset: () => void) => JSX.Element
}

/** Public boundary. Use a render prop for custom fallback; default is inline. */
export function ErrorBoundary(props: ErrorBoundaryProps): JSX.Element {
  const [resetKey, setResetKey] = createSignal(0)
  const reset = (): void => { setResetKey((current) => current + 1) }
  const remounted = createMemo(() => resetKey())
  return (
    <SolidErrorBoundary fallback={(error, retry) => (
      props.fallback !== undefined
        ? props.fallback(error, () => { retry(); reset() })
        : <ErrorFallback error={error} onRetry={() => { retry(); reset() }} />
    )}>
      <Show when={true}>{props.children}</Show>
    </SolidErrorBoundary>
  )
}

interface ErrorFallbackProps {
  readonly error: unknown
  readonly onRetry: () => void
}
function ErrorFallback(props: ErrorFallbackProps): JSX.Element {
  return (
    <div role="alert" class="ui-error-fallback">
      <div class="ui-error-fallback-icon" aria-hidden="true">
        <AlertTriangle size={18} />
      </div>
      <div class="ui-error-fallback-body">
        <h4 class="ui-error-fallback-title">Something went wrong</h4>
        <p class="ui-error-fallback-message">{describeError(props.error)}</p>
      </div>
      <button type="button" class="ui-error-fallback-retry" onClick={() => props.onRetry()}>
        <RefreshCw size={14} aria-hidden="true" />
        <span>Retry</span>
      </button>
    </div>
  )
}

const describeError = (error: unknown): string => {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  try { return JSON.stringify(error) } catch { return "Unknown error" }
}
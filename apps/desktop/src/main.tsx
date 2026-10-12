import { render } from "solid-js/web"
import App from "./app/App.tsx"
import "./styles/globals.css"
import "./styles/ui.css"
import "./features/dashboard/styles/dashboard.css"
import "./features/marketplace/styles/marketplace.css"
import "./features/library/styles/library.css"
import "./styles/misc.css"
import "./styles/professional.css"
import "./styles/glass.css"
import { ToastViewport } from "./shared/ui/feedback.tsx"
import { Toaster } from "./shared/ui/toast.tsx"

// In the desktop app the webview's console and uncaught errors go to the shell log (next to the sidecar's), where support finds them.
// (`attachConsole` of the log plugin goes the other way, Rust to console, so the calls are forwarded here.)
if ("__TAURI_INTERNALS__" in window) {
  void import("@tauri-apps/plugin-log").then(({ debug, error, info, warn }) => {
    const forward = (method: "debug" | "info" | "log" | "warn" | "error", write: (message: string) => Promise<void>) => {
      const original = console[method].bind(console)
      console[method] = (...args: unknown[]) => {
        original(...args)
        void write(args.map((a) => (typeof a === "string" ? a : a instanceof Error ? a.message : JSON.stringify(a))).join(" ")).catch(() => undefined)
      }
    }
    forward("debug", debug); forward("log", info); forward("info", info); forward("warn", warn); forward("error", error)
    window.addEventListener("error", (event) => { void error(`webview error: ${event.message} (${event.filename}:${event.lineno})`) })
    window.addEventListener("unhandledrejection", (event) => { void error(`webview unhandled rejection: ${String(event.reason)}`) })
  }).catch(() => undefined)
}

render(() => (
  <>
    <App />
    <ToastViewport />
    {/* Mounted once at the root so `toast.tsx` messages raised outside the
        CAD/CAM pages (assistant panel, AI settings) are visible too. */}
    <Toaster />
  </>
), document.getElementById("root")!)

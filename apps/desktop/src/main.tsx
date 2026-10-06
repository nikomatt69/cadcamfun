import { render } from "solid-js/web"
import App from "./app/App.tsx"
import "./styles/globals.css"
import "./styles/ui.css"
import "./styles/dashboard.css"
import "./styles/marketplace.css"
import "./styles/library.css"
import "./styles/misc.css"
import { ToastViewport } from "./components/ui/feedback.tsx"

render(() => (
  <>
    <App />
    <ToastViewport />
  </>
), document.getElementById("root")!)

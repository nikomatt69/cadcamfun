import { RegistryProvider } from "@effect/atom-solid"
import { Route, Router } from "@solidjs/router"
import { lazy } from "solid-js"
import { render } from "solid-js/web"
import "./styles.css"

const Projects = lazy(() => import("./pages/Projects"))
const Editor = lazy(() => import("./pages/Editor"))

render(
  () => (
    <RegistryProvider>
      <Router>
        <Route path="/" component={Projects} />
        <Route path="/p/:id" component={Editor} />
      </Router>
    </RegistryProvider>
  ),
  document.getElementById("root")!,
)

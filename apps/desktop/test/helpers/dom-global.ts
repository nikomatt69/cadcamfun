/** Importing this first installs the DOM before any module that touches `window` at load time (Solid delegates events on import). */
import { installDom } from "./dom.ts"

installDom()

/**
 * The Portuguese (Brazil) pack: the tables of every vertical, merged.
 *
 * The order of the merge is the order of the verticals; the last file wins a key
 * that two of them share.
 */
import base from "./base.json" with { type: "json" }
import shell from "./shell.json" with { type: "json" }
import library from "./library.json" with { type: "json" }
import org from "./org.json" with { type: "json" }
import cad from "./cad.json" with { type: "json" }
import cam from "./cam.json" with { type: "json" }
import ai from "./ai.json" with { type: "json" }
import plugins from "./plugins.json" with { type: "json" }
import legacy from "./legacy.json" with { type: "json" }
import settings from "./settings.json" with { type: "json" }
import viewport from "./viewport.json" with { type: "json" }
import system from "./system.json" with { type: "json" }
import pricing from "./pricing.json" with { type: "json" }
import detail from "./detail.json" with { type: "json" }
import companion from "./companion.json" with { type: "json" }
import vcs from "./vcs.json" with { type: "json" }
import manuals from "./manuals.json" with { type: "json" }
import keys from "./keys.json" with { type: "json" }

/** The tables of the Portuguese (Brazil) language, merged. */
export default { ...base, ...shell, ...library, ...org, ...cad, ...cam, ...ai, ...plugins, ...legacy, ...settings, ...viewport, ...system, ...pricing, ...detail, ...companion, ...vcs, ...manuals, ...keys }

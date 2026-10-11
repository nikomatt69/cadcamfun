const path = require("path")
const { getDefaultConfig } = require("expo/metro-config")
const { withNativeWind } = require("nativewind/metro")

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, "../..")

const config = getDefaultConfig(projectRoot)

// Include the workspace root so Metro can see the bun-hoisted node_modules and
// the `@cadcamfun/api` workspace package.
config.watchFolders = [workspaceRoot]

// Force every import of react / react-dom / react-native to resolve to THIS
// package's copy, preventing multiple React instances when workspace deps
// require different majors (the desktop uses 19.x too, but other packages may
// not — a second React copy breaks hooks silently).
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const isReactModule =
    moduleName === "react" ||
    moduleName === "react-dom" ||
    moduleName === "react-native" ||
    moduleName.startsWith("react/") ||
    moduleName.startsWith("react-dom/")
  if (isReactModule) {
    return {
      filePath: require.resolve(moduleName, { paths: [path.join(projectRoot, "node_modules")] }),
      type: "sourceFile",
    }
  }
  return context.resolveRequest(context, moduleName, platform)
}

module.exports = withNativeWind(config, { input: "./global.css" })

module.exports = function (api) {
  api.cache(true)
  return {
    presets: [["babel-preset-expo", { jsxImportSource: "nativewind" }]],
    plugins: [
      [
        "module-resolver",
        {
          root: ["./"],
          alias: {
            "@": "./",
          },
          extensions: [".ts", ".tsx", ".js", ".jsx"],
        },
      ],
      // Worklets must be transformed after every other Babel plugin.
      "react-native-worklets/plugin",
    ],
  }
}

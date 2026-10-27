import { Pressable } from "react-native"

/**
 * NativeWind's JSX runtime swaps every `Pressable` for an interop wrapper (to support `className`), and that
 * wrapper flattens `style` as an object: a `style={({ pressed }) => …}` function is dropped whole, so the
 * button loses its size, shape, flex and row layout. No Pressable in the app uses `className`, so it goes back
 * to React Native's own component. Imported once, first, by the root layout.
 */
// The registry is not exported from the package root; the version is pinned in package.json for this reason.
// eslint-disable-next-line @typescript-eslint/no-require-imports
require("react-native-css-interop/dist/runtime/components")
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { interopComponents } = require("react-native-css-interop/dist/runtime/native/api") as { interopComponents: Map<unknown, unknown> }
interopComponents.delete(Pressable)

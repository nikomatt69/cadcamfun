# SDK Command-Line Interface (CLI)

The Plugin SDK includes a command-line interface (CLI) to streamline common development tasks.

*Run these commands from your main project root directory.*

## Available Commands

*(This section should be populated based on `plugin-cli.ts`)*

-   **`create <plugin-name>`:**
    -   Scaffolds a new plugin project based on the default template.
    -   Example: `npx ts-node src/plugins/sdk/cli/plugin-cli.ts create my-awesome-plugin`

-   **`build [options]`:**
    -   Compiles the plugin source code (TypeScript) into JavaScript.
    -   Typically uses webpack or a similar bundler (see `build-plugin.ts`).
    -   Options might include `--watch` for development or `--production` for optimized builds.
    -   Example: `npx ts-node src/plugins/sdk/cli/plugin-cli.ts build --plugin-path ./path/to/your-plugin` (Add `--watch` or other options as needed)

-   **`package [options]`:**
    -   Bundles the built plugin code, manifest, and assets into a distributable package (e.g., a `.zip` or `.cadcam-plugin` file).
    -   See `package-plugin.ts` for details.
    -   Example: `npx ts-node src/plugins/sdk/cli/plugin-cli.ts package --plugin-path ./path/to/your-plugin`

-   **`validate [options]`:**
    -   Checks the `plugin-manifest.json` for correctness and completeness.
    -   May perform other static analysis checks.
    -   See `validate-plugin.ts`.
    -   Example: `npx ts-node src/plugins/sdk/cli/plugin-cli.ts validate --plugin-path ./path/to/your-plugin`

-   **`test [options]`:**
    -   Runs the plugin's test suite.
    -   See `test-plugin.ts`.
    -   Example: `npx ts-node src/plugins/sdk/cli/plugin-cli.ts test --plugin-path ./path/to/your-plugin`

*(Add other commands if available, e.g., for publishing, linting, etc.)*

## Integration with Plugin `package.json`

It's common practice to add scripts to your *plugin's* `package.json` (not the main project one) to simplify running these commands *relative to the plugin directory*:

```json
{
  "scripts": {
    "build": "npx ts-node ../../sdk/cli/plugin-cli.ts build --plugin-path .",
    "watch": "npx ts-node ../../sdk/cli/plugin-cli.ts build --plugin-path . --watch",
    "package": "npx ts-node ../../sdk/cli/plugin-cli.ts package --plugin-path .",
    "validate": "npx ts-node ../../sdk/cli/plugin-cli.ts validate --plugin-path .",
    "test": "npx ts-node ../../sdk/cli/plugin-cli.ts test --plugin-path ."
  }
}
```

This allows you to `cd` into your plugin directory and run commands like `npm run build` or `yarn build`. 
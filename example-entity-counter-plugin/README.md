# Entity Counter Example Plugin

This plugin demonstrates requesting permissions, rendering a simple UI, and interacting with the host application's API (specifically, counting model entities).

## Functionality

*   Requests `model:read` and `system:notifications` permissions.
*   Renders a simple UI with a button when loaded in an appropriate host (like a sidebar panel).
*   When the button is clicked:
    *   Calls the host's `model.getEntities()` API.
    *   Displays the count of returned entities in its UI.
    *   Shows a notification using the host's `ui.showNotification()` API.

## Building the Plugin

1.  **Install Dependencies:**
    ```bash
    npm install
    # or
    yarn install
    ```
2.  **Compile TypeScript:**
    ```bash
    npm run build
    # or
    yarn build
    ```
    This compiles `src/main.ts` to `dist/main.js`.

## Packaging for Installation

Create a `.zip` file containing:

1.  `manifest.json` (at the root of the archive)
2.  The entire `dist/` directory.

**Example (using zip command line):**

```bash
# Make sure you have built the plugin first (npm run build)
zip -r ../entity-counter-plugin-v0.1.0.zip manifest.json dist/
```

Install the generated `.zip` file using the "Install Plugin" dialog in the main application. 
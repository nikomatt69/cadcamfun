# API Reference

This section provides an overview of the Plugin API provided by the CAD/CAM FUN SDK. For detailed specifications, please refer to the automatically generated documentation produced by TypeDoc.

**(Link to generated TypeDoc output will go here - typically `./dist-docs/index.html` or similar)**

## Core Concepts

- **Namespaces:** The API is organized into namespaces (e.g., `cadApi.model`, `cadApi.ui`).
- **Asynchronous Operations:** Many API calls are asynchronous and return Promises.
- **Permissions:** Access to certain APIs requires corresponding permissions declared in the `plugin-manifest.json`.

## Major API Modules

*(This section should be populated based on the actual structure in `cadcam-plugin-api.d.ts`)*

-   **`cadApi.model`:** Interacting with the CAD model (reading entities, modifying geometry, etc.).
    -   Requires permissions like `model:read`, `model:write`.
-   **`cadApi.ui`:** Interacting with the user interface (showing notifications, managing sidebars, adding commands).
    -   Requires permissions like `ui:notifications`, `ui:sidebar`.
-   **`cadApi.events`:** Subscribing to application events (selection changes, document opening, etc.).
    -   Permissions may vary depending on the event.
-   **`cadApi.storage`:** Storing and retrieving plugin-specific data.
    -   Requires `storage:local` or `storage:global`.
-   **`cadApi.workspace`:** Accessing information about the current project or workspace.

<h2 id="permissions">Permissions</h2>

(List and briefly explain the available permission strings, e.g., `model:read`, `model:write`, `ui:sidebar`, `network:request`, etc.)

<h2 id="contributions">UI Contributions</h2>

(Explain how plugins can contribute UI elements defined in the `contributes` section of the manifest, linking to relevant API functions if applicable.)

- Sidebars
- Toolbar Buttons
- Commands & Keybindings
- Context Menus
- Settings

## Generated Documentation

Consult the TypeDoc generated output for the full API details, including function signatures, type definitions, and descriptions.

**(Link again)** 
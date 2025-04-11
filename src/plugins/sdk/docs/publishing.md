# Publishing Your Plugin

Once your plugin is developed, tested, and validated, you can share it with other CAD/CAM FUN users.

## Packaging

First, create the distributable package using the SDK CLI:

```bash
npx cadcam-plugin-cli package
# or
npm run package
# or
yarn package
```

This command (`package-plugin.ts`) will typically create a file like `com.yourcompany.your-plugin-name-1.0.0.cadcam-plugin` (or a `.zip` file) in a `dist` or similar output directory. This package contains your compiled code, manifest, and any necessary assets.

## Distribution Options

*(This section depends heavily on how plugins are distributed in your ecosystem. Choose the relevant options.)*

1.  **Official Marketplace (Recommended):**
    -   If there's an official CAD/CAM FUN Plugin Marketplace, this is usually the preferred method.
    -   *(Describe the process: Creating an account, submitting the plugin package, review process, etc.)*
    -   The SDK might include tools for interacting with the marketplace API (e.g., in `src/plugins/sdk/marketplace`). Check for commands like `cadcam-plugin-cli publish`.

2.  **Manual Distribution:**
    -   You can share the generated package file (`.cadcam-plugin` or `.zip`) directly with users (e.g., via email, download link on a website).
    -   Users would then typically install it manually through the Plugin Manager within the CAD/CAM FUN application.
    -   *(Explain the manual installation steps for users)*

3.  **Private Repository/Registry:**
    -   For internal or enterprise use, you might set up a private plugin registry.
    -   *(Mention if the application supports configuring custom registry URLs)*

## Publishing Checklist

Before publishing:

-   [ ] **Version:** Ensure the `version` in `plugin-manifest.json` is correct (follow Semantic Versioning).
-   [ ] **Validation:** Run `npm run validate`.
-   [ ] **Testing:** Confirm all tests pass (`npm test`) and perform thorough manual testing.
-   [ ] **Documentation:** Include a `README.md` within your plugin project explaining its features and usage.
-   [ ] **Icon:** Provide a clear icon (referenced in `plugin-manifest.json`).
-   [ ] **License:** Specify a license if applicable.
-   [ ] **Packaging:** Generate the final package using `npm run package`.

*(Add any specific requirements for the official marketplace, if applicable)* 
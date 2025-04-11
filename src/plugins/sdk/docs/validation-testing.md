# Validation and Testing

Ensuring your plugin is correct, robust, and secure is crucial.
The SDK provides tools to help with validation and testing.

## Manifest Validation

Before packaging or publishing, always validate your `plugin-manifest.json`.

```bash
npx cadcam-plugin-cli validate
# or
npm run validate
# or
yarn validate
```

This command (`validate-plugin.ts`) checks:
-   Correct JSON format.
-   Presence of required fields (`id`, `name`, `version`, `main`, `engines`).
-   Validity of field values (e.g., version format, permission strings).
-   (Potentially) Existence of the `main` file and other referenced assets.
-   Schema adherence (using `plugin-schema-validator.ts`).

## Linting and Formatting

Consistent code style improves readability and maintainability. Consider integrating tools like ESLint and Prettier into your development workflow.

(Provide setup instructions or link to standard configurations if available).

## Unit Testing

The SDK may provide utilities (`test-plugin.ts`) for unit testing your plugin's logic in isolation.

(Explain how to structure tests and use the provided testing utilities or recommend standard frameworks like Jest or Vitest).

```bash
npx cadcam-plugin-cli test
# or
npm test
# or
yarn test
```

## Integration Testing

Testing how your plugin interacts with the main CAD/CAM FUN application is important.

-   **Manual Testing:** Load your built plugin into the application (see [Getting Started](./getting-started.md)) and test its functionality thoroughly.
-   **Automated Integration Tests:** (If the SDK or application provides a test harness or automation APIs, describe them here. This might involve launching the application with specific flags or using a dedicated testing framework.) 
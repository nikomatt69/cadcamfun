// Main entry point for the CAD/CAM FUN Plugin SDK package

// Export core types (adjust paths if necessary)
export * from './types/cadcam-plugin-api';
export * from './types/plugin-manifest';

// Export utility functions
export * from './utils';

// Export validation functions (if intended for public use)
// Explicitly export only the necessary items to avoid name collisions
export { validateManifest } from './validation/plugin-schema-validator'; // Export specific items
// We might export other things from validate-plugin if needed, but not ValidationResult
export { validatePlugin } from './validation/validate-plugin';


// Export test utilities (if intended for public use)


// Export template generator function (if intended for public use)
export * from './templates/plugin-template-generator';

// NOTE: We generally don't export the CLI functions directly,
// as the CLI is intended to be used via the 'bin' script. 
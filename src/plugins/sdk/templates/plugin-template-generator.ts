/**
 * Plugin Template Generator
 * 
 * Creates scaffolding for new plugin projects with proper structure,
 * configuration files, and TypeScript setup.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { execSync } from 'child_process';

/**
 * Template configuration
 */
export interface TemplateConfig {
  /** Plugin ID */
  id: string;
  
  /** Plugin name */
  name: string;
  
  /** Plugin description */
  description: string;
  
  /** Plugin author */
  author: string;
  
  /** Plugin repository URL */
  repository?: string;
  
  /** Plugin license */
  license?: string;
  
  /** Target directory to create the plugin in */
  targetDir: string;
  
  /** Template type */
  template: 'basic' | 'sidebar' | 'toolbar' | 'full';
  
  /** Initialize Git repository */
  initGit?: boolean;
  
  /** Install dependencies */
  installDependencies?: boolean;
  
  /** Use TypeScript */
  useTypeScript: boolean;
  
  /** Additional permissions */
  permissions?: string[];
}

/**
 * Generate a new plugin project based on a template
 */
export async function generatePluginProject(config: TemplateConfig): Promise<void> {
  try {
    // Create the target directory
    await fs.mkdir(config.targetDir, { recursive: true });
    
    // Create standard directory structure
    await createDirectoryStructure(config);
    
    // Generate package.json
    await generatePackageJson(config);
    
    // Generate plugin.json manifest
    await generateManifest(config);
    
    // Generate README.md
    await generateReadme(config);
    
    // Generate source files based on template
    await generateSourceFiles(config);
    
    // Generate TypeScript configuration (if enabled)
    if (config.useTypeScript) {
      await generateTypeScriptConfig(config);
    }
    
    // Generate build configuration (webpack)
    await generateWebpackConfig(config);
    
    // Initialize Git repository (if enabled)
    if (config.initGit) {
      await initializeGit(config);
    }
    
    // Install dependencies (if enabled)
    if (config.installDependencies) {
      await installDeps(config);
    }
    
    console.log(`Plugin project generated successfully at ${config.targetDir}`);
  } catch (error) {
    console.error('Failed to generate plugin project:', error);
    throw error;
  }
}

/**
 * Create the basic directory structure for a plugin
 */
async function createDirectoryStructure(config: TemplateConfig): Promise<void> {
  const directories = [
    'src',
    'src/ui',
    'dist',
    'assets',
    'tests',
    'docs',
  ];
  
  for (const dir of directories) {
    await fs.mkdir(path.join(config.targetDir, dir), { recursive: true });
  }
}

/**
 * Generate a package.json file for the plugin
 */
async function generatePackageJson(config: TemplateConfig): Promise<void> {
  const packageJson = {
    name: config.id,
    version: '0.1.0',
    description: config.description,
    author: config.author,
    license: config.license || 'MIT',
    repository: config.repository,
    scripts: {
      build: 'webpack --mode production',
      dev: 'webpack --mode development --watch',
      test: 'jest',
      lint: 'eslint src/**/*.{js,ts}',
      "type-check": "tsc --noEmit",
      prepare: "npm run build"
    },
    devDependencies: {
      "@types/node": "^20.4.5",
      "typescript": "^5.1.6",
      "webpack": "^5.88.2",
      "webpack-cli": "^5.1.4",
      "ts-loader": "^9.4.4",
      "jest": "^29.6.2",
      "eslint": "^8.46.0",
      "@typescript-eslint/eslint-plugin": "^6.2.1",
      "@typescript-eslint/parser": "^6.2.1"
    },
    engines: {
      node: ">=16.0.0"
    }
  };
  
  // Write the package.json file
  await fs.writeFile(
    path.join(config.targetDir, 'package.json'),
    JSON.stringify(packageJson, null, 2)
  );
}

/**
 * Generate a plugin.json manifest file
 */
async function generateManifest(config: TemplateConfig): Promise<void> {
  // Base permissions
  const basePermissions = ['model:read'];
  const permissions = [...basePermissions, ...(config.permissions || [])];
  
  // Template-specific contributions
  let contributes: any = {};
  
  switch (config.template) {
    case 'sidebar':
      permissions.push('ui:sidebar');
      contributes = {
        sidebar: {
          title: config.name,
          icon: "assets/icon.svg",
          entry: "dist/ui/sidebar.js"
        }
      };
      break;
      
    case 'toolbar':
      permissions.push('ui:toolbar');
      contributes = {
        commands: [
          {
            id: `${config.id}.command1`,
            title: "Example Command",
            icon: "assets/command-icon.svg"
          }
        ],
        toolbarButtons: [
          {
            id: `${config.id}.toolbarButton1`,
            command: `${config.id}.command1`,
            title: "Example Button",
            icon: "assets/command-icon.svg",
            group: "plugin-buttons"
          }
        ]
      };
      break;
      
    case 'full':
      permissions.push('ui:sidebar', 'ui:toolbar', 'ui:contextMenu', 'model:write');
      contributes = {
        sidebar: {
          title: config.name,
          icon: "assets/icon.svg",
          entry: "dist/ui/sidebar.js"
        },
        commands: [
          {
            id: `${config.id}.command1`,
            title: "Example Command",
            icon: "assets/command-icon.svg"
          }
        ],
        toolbarButtons: [
          {
            id: `${config.id}.toolbarButton1`,
            command: `${config.id}.command1`,
            title: "Example Button",
            icon: "assets/command-icon.svg",
            group: "plugin-buttons"
          }
        ],
        contextMenu: [
          {
            command: `${config.id}.command1`,
            contexts: ["selection"],
            when: "selectionCount > 0"
          }
        ]
      };
      break;
  }
  
  // Create the manifest
  const manifest = {
    id: config.id,
    name: config.name,
    version: "0.1.0",
    description: config.description,
    author: config.author,
    repository: config.repository,
    license: config.license || "MIT",
    icon: "assets/icon.svg",
    main: "dist/main.js",
    engines: {
      cadcam: "^1.0.0"
    },
    permissions,
    contributes,
    activationEvents: ["onStartup"]
  };
  
  // Write the manifest file
  await fs.writeFile(
    path.join(config.targetDir, 'plugin.json'),
    JSON.stringify(manifest, null, 2)
  );
}

/**
 * Generate a README.md file for the plugin
 */
async function generateReadme(config: TemplateConfig): Promise<void> {
  const readme = `# ${config.name}

${config.description}

## Features

- Feature 1
- Feature 2
- Feature 3

## Installation

1. Open CAD/CAM FUN
2. Go to Plugin Manager
3. Install this plugin from the marketplace, or
4. Use "Install from File" and select the .zip file

## Usage

Brief description of how to use the plugin goes here.

## Development

This plugin is built with ${config.useTypeScript ? 'TypeScript' : 'JavaScript'} and the CAD/CAM FUN Plugin SDK.

### Building

\`\`\`
npm install
npm run build
\`\`\`

### Development Build (with watch)

\`\`\`
npm run dev
\`\`\`

### Testing

\`\`\`
npm test
\`\`\`

## License

${config.license || 'MIT'}
`;
  
  // Write the README.md file
  await fs.writeFile(
    path.join(config.targetDir, 'README.md'),
    readme
  );
}

/**
 * Generate source files based on template
 */
async function generateSourceFiles(config: TemplateConfig): Promise<void> {
  const extension = config.useTypeScript ? '.ts' : '.js';
  
  // Create default icon.svg
  await createDefaultIcon(config);
  
  // Create main file
  await generateMainFile(config, extension);
  
  // Create UI files if needed
  if (['sidebar', 'full'].includes(config.template)) {
    await generateSidebarFile(config, extension);
  }
  
  // Create command handler file if needed
  if (['toolbar', 'full'].includes(config.template)) {
    await generateCommandsFile(config, extension);
  }
}

/**
 * Create a default icon.svg file
 */
async function createDefaultIcon(config: TemplateConfig): Promise<void> {
  const svgContent = `<svg width="128" height="128" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="128" height="128" rx="16" fill="#2563EB"/>
  <path d="M64 96C81.6731 96 96 81.6731 96 64C96 46.3269 81.6731 32 64 32C46.3269 32 32 46.3269 32 64C32 81.6731 46.3269 96 64 96Z" stroke="white" stroke-width="6"/>
  <path d="M64 80C72.8366 80 80 72.8366 80 64C80 55.1634 72.8366 48 64 48C55.1634 48 48 55.1634 48 64C48 72.8366 55.1634 80 64 80Z" fill="white"/>
</svg>`;
  
  // Write the icon file
  await fs.writeFile(
    path.join(config.targetDir, 'assets', 'icon.svg'),
    svgContent
  );
  
  // If it's a toolbar or full template, also create a command icon
  if (['toolbar', 'full'].includes(config.template)) {
    const commandIconContent = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M2 17L12 22L22 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M2 12L12 17L22 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
    
    await fs.writeFile(
      path.join(config.targetDir, 'assets', 'command-icon.svg'),
      commandIconContent
    );
  }
}

/**
 * Generate the main entry file
 */
async function generateMainFile(config: TemplateConfig, extension: string): Promise<void> {
  const mainContent = config.useTypeScript
    ? `/**
 * Main entry point for the ${config.name} plugin
 */

/**
 * Initialize the plugin
 * @param context The plugin initialization context
 * @param api The CAD/CAM API
 */
export function initialize(context: CADCAM.PluginInitializationContext, api: CADCAM.PluginAPI): void {
  // Register for deactivation
  context.onDeactivation(() => {
    // Clean up resources here when the plugin is deactivated
    console.log('${config.name} plugin deactivated');
  });
  
  // Log initialization
  api.host.log('${config.name} plugin initialized');
}

/**
 * Activate the plugin
 * @param api The CAD/CAM API
 */
export async function activate(api: CADCAM.PluginAPI): Promise<void> {
  api.host.log('${config.name} plugin activated');
  
  ${config.template === 'basic' ? `
  // Register for selection changes
  api.model.onSelectionChanged(selection => {
    console.log('Selection changed:', selection);
  });` : ''}
  ${['toolbar', 'full'].includes(config.template) ? `
  // Register command handlers
  registerCommands(api);` : ''}
  
  // Notify the host that we're ready
  await api.host.notifyReady();
}

${['toolbar', 'full'].includes(config.template) ? `
/**
 * Register command handlers
 */
function registerCommands(api: CADCAM.PluginAPI): void {
  // Import command handlers
  import('./commands${extension}').then(commands => {
    commands.registerCommands(api);
  });
}` : ''}

/**
 * Plugin deactivation
 */
export function deactivate(): void {
  console.log('${config.name} plugin deactivated');
}
`
    : `/**
 * Main entry point for the ${config.name} plugin
 */

/**
 * Initialize the plugin
 * @param {Object} context - The plugin initialization context
 * @param {Object} api - The CAD/CAM API
 */
export function initialize(context, api) {
  // Register for deactivation
  context.onDeactivation(() => {
    // Clean up resources here when the plugin is deactivated
    console.log('${config.name} plugin deactivated');
  });
  
  // Log initialization
  api.host.log('${config.name} plugin initialized');
}

/**
 * Activate the plugin
 * @param {Object} api - The CAD/CAM API
 */
export async function activate(api) {
  api.host.log('${config.name} plugin activated');
  
  ${config.template === 'basic' ? `
  // Register for selection changes
  api.model.onSelectionChanged(selection => {
    console.log('Selection changed:', selection);
  });` : ''}
  ${['toolbar', 'full'].includes(config.template) ? `
  // Register command handlers
  registerCommands(api);` : ''}
  
  // Notify the host that we're ready
  await api.host.notifyReady();
}

${['toolbar', 'full'].includes(config.template) ? `
/**
 * Register command handlers
 */
function registerCommands(api) {
  // Import command handlers
  import('./commands${extension}').then(commands => {
    commands.registerCommands(api);
  });
}` : ''}

/**
 * Plugin deactivation
 */
export function deactivate() {
  console.log('${config.name} plugin deactivated');
}
`;
  
  // Write the main file
  await fs.writeFile(
    path.join(config.targetDir, 'src', `main${extension}`),
    mainContent
  );
}

/**
 * Generate the sidebar UI file
 */
async function generateSidebarFile(config: TemplateConfig, extension: string): Promise<void> {
  const sidebarContent = config.useTypeScript
    ? `/**
 * Sidebar UI for the ${config.name} plugin
 */

// We use DOM APIs directly, but you could use a framework like React or Vue
// by bundling it with your plugin

/**
 * Initialize the sidebar UI
 * @param hostElement The host element for the sidebar
 * @param api The CAD/CAM API
 */
export function initializeSidebar(hostElement: HTMLElement, api: CADCAM.PluginAPI): void {
  // Create the sidebar UI
  const sidebar = document.createElement('div');
  sidebar.className = 'plugin-sidebar';
  
  // Add a header
  const header = document.createElement('h2');
  header.textContent = '${config.name}';
  sidebar.appendChild(header);
  
  // Add a description
  const description = document.createElement('p');
  description.textContent = '${config.description}';
  sidebar.appendChild(description);
  
  // Add a button that does something
  const button = document.createElement('button');
  button.textContent = 'Get Selected Entities';
  button.addEventListener('click', async () => {
    const selection = await api.model.getSelection();
    updateSelectionInfo(sidebar, selection, api);
  });
  sidebar.appendChild(button);
  
  // Add a container for selection info
  const selectionContainer = document.createElement('div');
  selectionContainer.id = 'selection-info';
  selectionContainer.style.marginTop = '20px';
  sidebar.appendChild(selectionContainer);
  
  // Add the sidebar to the host element
  hostElement.appendChild(sidebar);
  
  // Register for selection changes
  api.model.onSelectionChanged(selection => {
    updateSelectionInfo(sidebar, selection, api);
  });
}

/**
 * Update the selection info in the sidebar
 * @param sidebarElement The sidebar element
 * @param selection The selected entity IDs
 * @param api The CAD/CAM API
 */
async function updateSelectionInfo(
  sidebarElement: HTMLElement,
  selection: string[],
  api: CADCAM.PluginAPI
): Promise<void> {
  const selectionContainer = sidebarElement.querySelector('#selection-info');
  if (!selectionContainer) return;
  
  // Clear the container
  selectionContainer.innerHTML = '';
  
  // Add a header
  const header = document.createElement('h3');
  header.textContent = 'Selection Info';
  selectionContainer.appendChild(header);
  
  if (selection.length === 0) {
    const noSelection = document.createElement('p');
    noSelection.textContent = 'No entities selected';
    selectionContainer.appendChild(noSelection);
    return;
  }
  
  // Create a list of selected entities
  const list = document.createElement('ul');
  
  // Fetch each entity
  for (const id of selection) {
    const entity = await api.model.getEntityById(id);
    if (entity) {
      const item = document.createElement('li');
      item.textContent = \`\${entity.name} (\${entity.type})\`;
      list.appendChild(item);
    }
  }
  
  selectionContainer.appendChild(list);
}

// Initialize when the module is loaded
window.addEventListener('DOMContentLoaded', () => {
  // The host element and API are provided by the plugin host
  const hostElement = document.getElementById('plugin-host');
  const api = (window as any).pluginApi;
  
  if (hostElement && api) {
    initializeSidebar(hostElement, api);
  } else {
    console.error('Host element or plugin API not found');
  }
});
`
    : `/**
 * Sidebar UI for the ${config.name} plugin
 */

// We use DOM APIs directly, but you could use a framework like React or Vue
// by bundling it with your plugin

/**
 * Initialize the sidebar UI
 * @param {HTMLElement} hostElement - The host element for the sidebar
 * @param {Object} api - The CAD/CAM API
 */
export function initializeSidebar(hostElement, api) {
  // Create the sidebar UI
  const sidebar = document.createElement('div');
  sidebar.className = 'plugin-sidebar';
  
  // Add a header
  const header = document.createElement('h2');
  header.textContent = '${config.name}';
  sidebar.appendChild(header);
  
  // Add a description
  const description = document.createElement('p');
  description.textContent = '${config.description}';
  sidebar.appendChild(description);
  
  // Add a button that does something
  const button = document.createElement('button');
  button.textContent = 'Get Selected Entities';
  button.addEventListener('click', async () => {
    const selection = await api.model.getSelection();
    updateSelectionInfo(sidebar, selection, api);
  });
  sidebar.appendChild(button);
  
  // Add a container for selection info
  const selectionContainer = document.createElement('div');
  selectionContainer.id = 'selection-info';
  selectionContainer.style.marginTop = '20px';
  sidebar.appendChild(selectionContainer);
  
  // Add the sidebar to the host element
  hostElement.appendChild(sidebar);
  
  // Register for selection changes
  api.model.onSelectionChanged(selection => {
    updateSelectionInfo(sidebar, selection, api);
  });
}

/**
 * Update the selection info in the sidebar
 * @param {HTMLElement} sidebarElement - The sidebar element
 * @param {string[]} selection - The selected entity IDs
 * @param {Object} api - The CAD/CAM API
 */
async function updateSelectionInfo(sidebarElement, selection, api) {
  const selectionContainer = sidebarElement.querySelector('#selection-info');
  if (!selectionContainer) return;
  
  // Clear the container
  selectionContainer.innerHTML = '';
  
  // Add a header
  const header = document.createElement('h3');
  header.textContent = 'Selection Info';
  selectionContainer.appendChild(header);
  
  if (selection.length === 0) {
    const noSelection = document.createElement('p');
    noSelection.textContent = 'No entities selected';
    selectionContainer.appendChild(noSelection);
    return;
  }
  
  // Create a list of selected entities
  const list = document.createElement('ul');
  
  // Fetch each entity
  for (const id of selection) {
    const entity = await api.model.getEntityById(id);
    if (entity) {
      const item = document.createElement('li');
      item.textContent = \`\${entity.name} (\${entity.type})\`;
      list.appendChild(item);
    }
  }
  
  selectionContainer.appendChild(list);
}

// Initialize when the module is loaded
window.addEventListener('DOMContentLoaded', () => {
  // The host element and API are provided by the plugin host
  const hostElement = document.getElementById('plugin-host');
  const api = window.pluginApi;
  
  if (hostElement && api) {
    initializeSidebar(hostElement, api);
  } else {
    console.error('Host element or plugin API not found');
  }
});
`;
  
  // Write the sidebar file
  await fs.writeFile(
    path.join(config.targetDir, 'src', 'ui', `sidebar${extension}`),
    sidebarContent
  );
}

/**
 * Generate the commands file
 */
async function generateCommandsFile(config: TemplateConfig, extension: string): Promise<void> {
  const commandsContent = config.useTypeScript
    ? `/**
 * Command handlers for the ${config.name} plugin
 */

/**
 * Register command handlers
 * @param api The CAD/CAM API
 */
export function registerCommands(api: CADCAM.PluginAPI): void {
  // Register the command handler
  api.events.on(\`command:${config.id}.command1\`, () => {
    handleExampleCommand(api);
  });
  
  api.host.log('Commands registered');
}

/**
 * Handle the example command
 * @param api The CAD/CAM API
 */
async function handleExampleCommand(api: CADCAM.PluginAPI): Promise<void> {
  api.host.log('Example command executed');
  
  // Show a notification
  await api.ui.showNotification('Example command executed!', {
    type: 'info',
    duration: 3000
  });
  
  // Get the current selection
  const selection = await api.model.getSelection();
  
  if (selection.length === 0) {
    await api.ui.showDialog({
      title: 'No Selection',
      message: 'Please select at least one entity to use this command.',
      type: 'info',
      buttons: [{ text: 'OK', id: 'ok', primary: true }]
    });
    return;
  }
  
  // Show a confirmation dialog
  const result = await api.ui.showDialog({
    title: 'Confirm Action',
    message: \`Apply action to \${selection.length} selected entities?\`,
    type: 'question',
    buttons: [
      { text: 'Yes', id: 'yes', primary: true },
      { text: 'No', id: 'no' }
    ]
  });
  
  if (result.buttonId === 'yes') {
    // Do something with the selection
    api.host.log(\`Performing action on \${selection.length} entities\`);
    
    // Example: Get entity details
    for (const entityId of selection) {
      const entity = await api.model.getEntityById(entityId);
      if (entity) {
        api.host.log(\`Entity: \${entity.name} (\${entity.type})\`);
      }
    }
    
    // Show a success notification
    await api.ui.showNotification('Action completed successfully!', {
      type: 'success',
      duration: 3000
    });
  }
}
`
    : `/**
 * Command handlers for the ${config.name} plugin
 */

/**
 * Register command handlers
 * @param {Object} api - The CAD/CAM API
 */
export function registerCommands(api) {
  // Register the command handler
  api.events.on(\`command:${config.id}.command1\`, () => {
    handleExampleCommand(api);
  });
  
  api.host.log('Commands registered');
}

/**
 * Handle the example command
 * @param {Object} api - The CAD/CAM API
 */
async function handleExampleCommand(api) {
  api.host.log('Example command executed');
  
  // Show a notification
  await api.ui.showNotification('Example command executed!', {
    type: 'info',
    duration: 3000
  });
  
  // Get the current selection
  const selection = await api.model.getSelection();
  
  if (selection.length === 0) {
    await api.ui.showDialog({
      title: 'No Selection',
      message: 'Please select at least one entity to use this command.',
      type: 'info',
      buttons: [{ text: 'OK', id: 'ok', primary: true }]
    });
    return;
  }
  
  // Show a confirmation dialog
  const result = await api.ui.showDialog({
    title: 'Confirm Action',
    message: \`Apply action to \${selection.length} selected entities?\`,
    type: 'question',
    buttons: [
      { text: 'Yes', id: 'yes', primary: true },
      { text: 'No', id: 'no' }
    ]
  });
  
  if (result.buttonId === 'yes') {
    // Do something with the selection
    api.host.log(\`Performing action on \${selection.length} entities\`);
    
    // Example: Get entity details
    for (const entityId of selection) {
      const entity = await api.model.getEntityById(entityId);
      if (entity) {
        api.host.log(\`Entity: \${entity.name} (\${entity.type})\`);
      }
    }
    
    // Show a success notification
    await api.ui.showNotification('Action completed successfully!', {
      type: 'success',
      duration: 3000
    });
  }
}
`;
  
  // Write the commands file
  await fs.writeFile(
    path.join(config.targetDir, 'src', `commands${extension}`),
    commandsContent
  );
}

/**
 * Generate TypeScript configuration files
 */
async function generateTypeScriptConfig(config: TemplateConfig): Promise<void> {
  const tsConfig = {
    compilerOptions: {
      target: "ES2020",
      module: "ESNext",
      moduleResolution: "node",
      esModuleInterop: true,
      strict: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      outDir: "dist",
      sourceMap: true,
      declaration: false,
      lib: ["DOM", "ESNext"],
      types: ["node"]
    },
    include: ["src/**/*"],
    exclude: ["node_modules", "dist"]
  };
  
  // Write the tsconfig.json file
  await fs.writeFile(
    path.join(config.targetDir, 'tsconfig.json'),
    JSON.stringify(tsConfig, null, 2)
  );
}

/**
 * Generate webpack configuration file
 */
async function generateWebpackConfig(config: TemplateConfig): Promise<void> {
  const webpackConfig = config.useTypeScript
    ? `const path = require('path');

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';
  
  return {
    mode: isProduction ? 'production' : 'development',
    devtool: isProduction ? 'source-map' : 'eval-source-map',
    entry: {
      main: './src/main.ts',
      ${['sidebar', 'full'].includes(config.template) ? `'ui/sidebar': './src/ui/sidebar.ts',` : ''}
    },
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: '[name].js',
      libraryTarget: 'module',
      clean: true
    },
    experiments: {
      outputModule: true,
    },
    resolve: {
      extensions: ['.ts', '.js']
    },
    module: {
      rules: [
        {
          test: /\\.ts$/,
          exclude: /node_modules/,
          use: {
            loader: 'ts-loader'
          }
        }
      ]
    }
  };
};
`
    : `const path = require('path');

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';
  
  return {
    mode: isProduction ? 'production' : 'development',
    devtool: isProduction ? 'source-map' : 'eval-source-map',
    entry: {
      main: './src/main.js',
      ${['sidebar', 'full'].includes(config.template) ? `'ui/sidebar': './src/ui/sidebar.js',` : ''}
    },
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: '[name].js',
      libraryTarget: 'module',
      clean: true
    },
    experiments: {
      outputModule: true,
    }
  };
};
`;
  
  // Write the webpack.config.js file
  await fs.writeFile(
    path.join(config.targetDir, 'webpack.config.js'),
    webpackConfig
  );
}

/**
 * Initialize a Git repository in the project directory
 */
async function initializeGit(config: TemplateConfig): Promise<void> {
  try {
    // Create .gitignore file
    const gitignore = `node_modules/
dist/
.DS_Store
*.log
coverage/
`;
    
    await fs.writeFile(
      path.join(config.targetDir, '.gitignore'),
      gitignore
    );
    
    // Initialize Git repository
    execSync(`git init`, { cwd: config.targetDir });
    console.log('Git repository initialized');
  } catch (error) {
    console.warn('Failed to initialize Git repository:', error);
  }
}

/**
 * Install npm dependencies
 */
async function installDeps(config: TemplateConfig): Promise<void> {
  try {
    console.log('Installing dependencies...');
    execSync(`npm install`, { cwd: config.targetDir, stdio: 'inherit' });
    console.log('Dependencies installed successfully');
  } catch (error) {
    console.warn('Failed to install dependencies:', error);
  }
}


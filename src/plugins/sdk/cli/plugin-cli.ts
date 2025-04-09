#!/usr/bin/env node
/**
 * CAD/CAM FUN Plugin CLI
 * 
 * Command-line tool for creating, testing, and managing CAD/CAM FUN plugins.
 * Provides a streamlined workflow for plugin developers.
 */

import { Command } from 'commander';
import * as inquirer from 'inquirer';
import * as chalk from 'chalk';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { generatePluginProject, TemplateConfig } from '../templates/plugin-template-generator';
import { validateManifest } from '../validation/plugin-schema-validator';
import { buildPlugin } from './build-plugin';
import { testPlugin } from '../test/test-plugin';
import { packagePlugin } from './package-plugin';
import { validatePlugin } from '../validation/validate-plugin';
import { getApiVersion } from '../utils';

// Get the directory where this script is located
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create a new command program
const program = new Command();

// Set up the CLI details
program
  .name('cadcam-plugin')
  .description('CAD/CAM FUN Plugin Development Tools')
  .version('1.0.0');

/**
 * 'create' command - Create a new plugin project
 */
program
  .command('create')
  .description('Create a new plugin project')
  .argument('[directory]', 'Target directory for the plugin (defaults to current directory)')
  .option('-t, --template <template>', 'Template to use: basic, sidebar, toolbar, or full')
  .option('--ts, --typescript', 'Use TypeScript')
  .option('--js, --javascript', 'Use JavaScript')
  .option('--git', 'Initialize Git repository')
  .option('--no-git', 'Skip Git initialization')
  .option('--install', 'Install dependencies')
  .option('--no-install', 'Skip dependency installation')
  .action(async (directory: string, options: any) => {
    try {
      console.log(chalk.blue('🔌 Creating new CAD/CAM FUN plugin project'));
      
      // If not provided, get the directory from the user
      const targetDir = directory || await promptForTargetDirectory();
      
      // Get plugin details from the user
      const config = await promptForPluginDetails(targetDir, options);
      
      // Generate the project
      console.log(chalk.yellow('⚙️ Generating plugin project...'));
      await generatePluginProject(config);
      
      // Success message
      console.log(chalk.green('✅ Plugin project created successfully!'));
      console.log(`\nNext steps:
- cd ${targetDir}
- ${config.installDependencies ? '' : 'npm install'}
- npm run dev   (for development build with watch)
- npm run build (for production build)
- npm test      (to run tests)`);
      
    } catch (error) {
      console.error(chalk.red('Error creating plugin project:'), error);
      process.exit(1);
    }
  });

/**
 * 'build' command - Build a plugin project
 */
program
  .command('build')
  .description('Build a plugin project')
  .option('-d, --dir <directory>', 'Plugin directory (defaults to current directory)')
  .option('-p, --production', 'Build for production')
  .option('-w, --watch', 'Watch for changes')
  .action(async (options) => {
    try {
      const dir = options.dir || process.cwd();
      
      // Check if the directory is a valid plugin project
      if (!await isPluginProject(dir)) {
        throw new Error(`Directory '${dir}' is not a valid plugin project`);
      }
      
      console.log(chalk.blue(`🔨 Building plugin at ${dir}`));
      
      // Build the plugin
      await buildPlugin(dir, {
        production: options.production || false,
        watch: options.watch || false
      });
      
      console.log(chalk.green('✅ Plugin built successfully!'));
      
    } catch (error) {
      console.error(chalk.red('Error building plugin:'), error);
      process.exit(1);
    }
  });

/**
 * 'test' command - Test a plugin
 */
program
  .command('test')
  .description('Test a plugin')
  .option('-d, --dir <directory>', 'Plugin directory (defaults to current directory)')
  .option('-u, --ui', 'Test UI components')
  .option('-w, --watch', 'Watch for changes')
  .action(async (options) => {
    try {
      const dir = options.dir || process.cwd();
      
      // Check if the directory is a valid plugin project
      if (!await isPluginProject(dir)) {
        throw new Error(`Directory '${dir}' is not a valid plugin project`);
      }
      
      console.log(chalk.blue(`🧪 Testing plugin at ${dir}`));
      
      // Test the plugin
      await testPlugin(dir, {
        ui: options.ui || false,
        watch: options.watch || false
      });
      
    } catch (error) {
      console.error(chalk.red('Error testing plugin:'), error);
      process.exit(1);
    }
  });

/**
 * 'package' command - Package a plugin for distribution
 */
program
  .command('package')
  .description('Package a plugin for distribution')
  .option('-d, --dir <directory>', 'Plugin directory (defaults to current directory)')
  .option('-o, --output <file>', 'Output file name')
  .option('--no-build', 'Skip building before packaging')
  .action(async (options) => {
    try {
      const dir = options.dir || process.cwd();
      
      // Check if the directory is a valid plugin project
      if (!await isPluginProject(dir)) {
        throw new Error(`Directory '${dir}' is not a valid plugin project`);
      }
      
      console.log(chalk.blue(`📦 Packaging plugin at ${dir}`));
      
      // Build the plugin first (unless --no-build specified)
      if (options.build) {
        console.log(chalk.yellow('⚙️ Building plugin...'));
        await buildPlugin(dir, { production: true });
      }
      
      // Package the plugin
      const outputFile = await packagePlugin(dir, options.output);
      
      console.log(chalk.green(`✅ Plugin packaged successfully: ${outputFile}`));
      
    } catch (error) {
      console.error(chalk.red('Error packaging plugin:'), error);
      process.exit(1);
    }
  });

/**
 * 'validate' command - Validate a plugin
 */
program
  .command('validate')
  .description('Validate a plugin project or package')
  .option('-d, --dir <directory>', 'Plugin directory (defaults to current directory)')
  .option('-f, --file <file>', 'Plugin package file')
  .action(async (options) => {
    try {
      if (options.file) {
        // Validate a plugin package file
        console.log(chalk.blue(`🔍 Validating plugin package: ${options.file}`));
        const result = await validatePlugin({ file: options.file });
        if (result.valid) {
          console.log(chalk.green('✅ Plugin package is valid!'));
          console.log(`\nPlugin details:`);
          console.log(`- ID: ${result.manifest.id}`);
          console.log(`- Name: ${result.manifest.name}`);
          console.log(`- Version: ${result.manifest.version}`);
          console.log(`- Author: ${result.manifest.author}`);
        } else {
          console.error(chalk.red('❌ Plugin package validation failed:'));
          for (const error of result.errors || []) {
            console.error(`- ${error}`);
          }
          process.exit(1);
        }
      } else {
        // Validate a plugin project directory
        const dir = options.dir || process.cwd();
        
        // Check if the directory is a valid plugin project
        if (!await isPluginProject(dir)) {
          throw new Error(`Directory '${dir}' is not a valid plugin project`);
        }
        
        console.log(chalk.blue(`🔍 Validating plugin at ${dir}`));
        const result = await validatePlugin({ directory: dir });
        if (result.valid) {
          console.log(chalk.green('✅ Plugin project is valid!'));
        } else {
          console.error(chalk.red('❌ Plugin project validation failed:'));
          for (const error of result.errors || []) {
            console.error(`- ${error}`);
          }
          process.exit(1);
        }
      }
    } catch (error) {
      console.error(chalk.red('Error validating plugin:'), error);
      process.exit(1);
    }
  });

/**
 * 'run' command - Run a plugin in development mode
 */
program
  .command('run')
  .description('Run a plugin in development mode')
  .option('-d, --dir <directory>', 'Plugin directory (defaults to current directory)')
  .option('-p, --port <port>', 'Port to run the development server on', '9000')
  .action(async (options) => {
    try {
      const dir = options.dir || process.cwd();
      
      // Check if the directory is a valid plugin project
      if (!await isPluginProject(dir)) {
        throw new Error(`Directory '${dir}' is not a valid plugin project`);
      }
      
      console.log(chalk.blue(`🚀 Running plugin at ${dir}`));
      console.log(chalk.yellow(`⚠️ NOTE: This command requires the CAD/CAM FUN application to be running.`));
      
      // Start the development server
      await runDevServer(dir, options.port);
      
    } catch (error) {
      console.error(chalk.red('Error running plugin:'), error);
      process.exit(1);
    }
  });

/**
 * 'docs' command - Generate plugin documentation
 */
program
  .command('docs')
  .description('Generate plugin documentation')
  .option('-d, --dir <directory>', 'Plugin directory (defaults to current directory)')
  .option('-o, --output <directory>', 'Output directory for documentation')
  .option('--html', 'Generate HTML documentation')
  .option('--markdown', 'Generate Markdown documentation')
  .action(async (options) => {
    try {
      const dir = options.dir || process.cwd();
      
      // Check if the directory is a valid plugin project
      if (!await isPluginProject(dir)) {
        throw new Error(`Directory '${dir}' is not a valid plugin project`);
      }
      
      console.log(chalk.blue(`📝 Generating documentation for plugin at ${dir}`));
      
      // Read the plugin manifest
      const manifestPath = path.join(dir, 'plugin.json');
      const manifestContent = await fs.readFile(manifestPath, 'utf-8');
      const manifest = JSON.parse(manifestContent);
      
      // Generate documentation
      const outputDir = options.output || path.join(dir, 'docs');
      await generateDocs(dir, manifest, outputDir, {
        html: options.html || true,
        markdown: options.markdown || false
      });
      
      console.log(chalk.green(`✅ Documentation generated at ${outputDir}`));
      
    } catch (error) {
      console.error(chalk.red('Error generating documentation:'), error);
      process.exit(1);
    }
  });

// Parse the command line arguments
program.parse(process.argv);

/**
 * Prompt the user for the target directory
 */
async function promptForTargetDirectory(): Promise<string> {
  const answers = await inquirer.createPromptModule()([
    {
      type: 'input',
      name: 'directory',
      message: 'Enter the directory for your plugin:',
      default: './my-plugin'
    }
  ]);
  
  return answers.directory;
}

/**
 * Prompt the user for plugin details
 */
async function promptForPluginDetails(targetDir: string, options: any): Promise<TemplateConfig> {
  // Normalize directory path
  const normalizedDir = path.resolve(targetDir);
  
  // Check if directory exists
  let directoryExists = false;
  try {
    await fs.access(normalizedDir);
    directoryExists = true;
  } catch (error) {
    // Directory doesn't exist, which is fine
  }
  
  // If directory exists and is not empty, ask for confirmation
  if (directoryExists) {
    try {
          const files = await fs.readdir(normalizedDir);
      if (files.length > 0) {
        const { proceed } = await inquirer.createPromptModule()([
          {
            type: 'confirm',
            name: 'proceed',
            message: `Directory ${normalizedDir} is not empty. Continue anyway?`,
            default: false
          }
        ]);
          
       
        
        if (!proceed) {
          console.log(chalk.yellow('Operation cancelled.'));
          process.exit(0);
        }
      }
    } catch (error) {
      // Can't read directory, will try to create it later
    }
  }
  const prompt = inquirer.createPromptModule();
  // Prompt for plugin details
  const answers = await prompt([
    {
      type: 'input',
      name: 'id',
      message: 'Plugin ID (format: domain.organization.plugin-name):',
      default: 'com.example.my-plugin',
      validate: (input: string) => {
        if (/^[a-z0-9-_.]+(\.[a-z0-9-_.]+)+$/.test(input)) {
          return true;
        }
        return 'Plugin ID must follow the format: domain.organization.plugin-name';
      }
    },
    {
      type: 'input',
      name: 'name',
      message: 'Plugin Name:',
      default: 'My Plugin'
    },
    {
      type: 'input',
      name: 'description',
      message: 'Plugin Description:',
      default: 'A plugin for CAD/CAM FUN'
    },
    {
      type: 'input',
      name: 'author',
      message: 'Plugin Author:',
      default: process.env.USER || process.env.USERNAME || 'Anonymous'
    },
    {
      type: 'list',
      name: 'template',
      message: 'Plugin Template:',
      default: options.template || 'basic',
      choices: [
        { name: 'Basic - Simple plugin with minimal functionality', value: 'basic' },
        { name: 'Sidebar - Plugin with a sidebar panel', value: 'sidebar' },
        { name: 'Toolbar - Plugin with toolbar buttons and commands', value: 'toolbar' },
        { name: 'Full - Complete plugin with sidebar, toolbar, and more', value: 'full' }
      ]
    },
    {
      type: 'list',
      name: 'useTypeScript',
      message: 'Language:',
      default: options.typescript ? 'true' : options.javascript ? 'false' : 'true',
      choices: [
        { name: 'TypeScript', value: true },
        { name: 'JavaScript', value: false }
      ]
    },
    {
      type: 'confirm',
      name: 'initGit',
      message: 'Initialize Git repository?',
      default: options.git !== undefined ? options.git : true
    },
    {
      type: 'confirm',
      name: 'installDependencies',
      message: 'Install dependencies?',
      default: options.install !== undefined ? options.install : true
    }
  ]);
  
  return {
    id: answers.id,
    name: answers.name,
    description: answers.description,
    author: answers.author,
    targetDir: normalizedDir,
    template: answers.template,
    useTypeScript: answers.useTypeScript,
    initGit: answers.initGit,
    installDependencies: answers.installDependencies
  };
}

/**
 * Check if a directory is a valid plugin project
 */
async function isPluginProject(dir: string): Promise<boolean> {
  try {
    // Check if plugin.json exists
    await fs.access(path.join(dir, 'plugin.json'));
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Run a development server for the plugin
 */
async function runDevServer(dir: string, port: string): Promise<void> {
  // This function would start a development server to test the plugin
  // It would typically:
  // 1. Build the plugin in watch mode
  // 2. Start a local server to serve the plugin
  // 3. Inject a development script into the plugin to communicate with the app
  
  // This is a placeholder for the actual implementation
  console.log(`Development server not yet implemented. Please run 'npm run dev' in the plugin directory.`);
}

/**
 * Generate documentation for a plugin
 */
async function generateDocs(
  pluginDir: string,
  manifest: any,
  outputDir: string,
  options: { html: boolean; markdown: boolean }
): Promise<void> {
  // Ensure output directory exists
  await fs.mkdir(outputDir, { recursive: true });
  
  // Generate the documentation
  if (options.html) {
    // Generate HTML documentation
    await generateHtmlDocs(pluginDir, manifest, outputDir);
  }
  
  if (options.markdown) {
    // Generate Markdown documentation
    await generateMarkdownDocs(pluginDir, manifest, outputDir);
  }
}

/**
 * Generate HTML documentation for a plugin
 */
async function generateHtmlDocs(pluginDir: string, manifest: any, outputDir: string): Promise<void> {
  // This is a placeholder for the actual implementation
  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${manifest.name} - Plugin Documentation</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
      line-height: 1.6;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
    }
    h1, h2, h3 {
      color: #2563EB;
    }
    .metadata {
      background-color: #f3f4f6;
      padding: 15px;
      border-radius: 5px;
      margin-bottom: 20px;
    }
    .permissions {
      background-color: #f0fdf4;
      padding: 15px;
      border-radius: 5px;
      margin-bottom: 20px;
    }
    .permission-item {
      padding: 5px 0;
    }
  </style>
</head>
<body>
  <h1>${manifest.name}</h1>
  <p>${manifest.description}</p>
  
  <div class="metadata">
    <p><strong>ID:</strong> ${manifest.id}</p>
    <p><strong>Version:</strong> ${manifest.version}</p>
    <p><strong>Author:</strong> ${manifest.author}</p>
    ${manifest.repository ? `<p><strong>Repository:</strong> <a href="${manifest.repository}">${manifest.repository}</a></p>` : ''}
    ${manifest.license ? `<p><strong>License:</strong> ${manifest.license}</p>` : ''}
  </div>
  
  <h2>Permissions</h2>
  <div class="permissions">
    ${manifest.permissions.map((perm: string) => `<div class="permission-item">${perm}</div>`).join('')}
  </div>
  
  <h2>Features</h2>
  <!-- This would be populated based on the plugin's manifest -->
  
  <h2>API Reference</h2>
  <!-- This would be generated from the plugin's code -->
  
  <h2>Usage Examples</h2>
  <!-- Usage examples would be included here -->
</body>
</html>`;
  
  await fs.writeFile(path.join(outputDir, 'index.html'), htmlContent);
}

/**
 * Generate Markdown documentation for a plugin
 */
async function generateMarkdownDocs(pluginDir: string, manifest: any, outputDir: string): Promise<void> {
  // This is a placeholder for the actual implementation
  const markdownContent = `# ${manifest.name}

${manifest.description}

## Metadata

- **ID:** ${manifest.id}
- **Version:** ${manifest.version}
- **Author:** ${manifest.author}
${manifest.repository ? `- **Repository:** ${manifest.repository}` : ''}
${manifest.license ? `- **License:** ${manifest.license}` : ''}

## Permissions

${manifest.permissions.map((perm: string) => `- \`${perm}\``).join('\n')}

## Features

<!-- This would be populated based on the plugin's manifest -->

## API Reference

<!-- This would be generated from the plugin's code -->

## Usage Examples

<!-- Usage examples would be included here -->
`;
  
  await fs.writeFile(path.join(outputDir, 'README.md'), markdownContent);
}


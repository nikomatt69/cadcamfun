/**
 * Plugin Build Utility
 * 
 * Builds a plugin project for development or production.
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { spawn } from 'child_process';
import chalk from 'chalk';

/**
 * Build options
 */
export interface BuildOptions {
  /** Build for production */
  production?: boolean;
  
  /** Watch for changes */
  watch?: boolean;
}

/**
 * Build a plugin project
 * 
 * @param pluginDir Plugin directory
 * @param options Build options
 */
export async function buildPlugin(pluginDir: string, options: BuildOptions = {}): Promise<void> {
  try {
    // Ensure the directory exists
    await fs.access(pluginDir);
    
    // Check if package.json exists
    const packageJsonPath = path.join(pluginDir, 'package.json');
    await fs.access(packageJsonPath);
    
    // Read package.json to check for build script
    const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8');
    const packageJson = JSON.parse(packageJsonContent);
    
    // Check if the project uses webpack
    const useWebpack = await hasWebpack(pluginDir);
    
    // Check if we should use npm, yarn, or pnpm
    const packageManager = await detectPackageManager(pluginDir);
    
    // Build the plugin
    if (useWebpack) {
      await buildWithWebpack(pluginDir, packageManager, options);
    } else if (packageJson.scripts && packageJson.scripts.build) {
      // Use the build script from package.json
      await buildWithScript(pluginDir, packageManager, options);
    } else {
      // Try to build with TypeScript or JavaScript
      await buildWithTypeScript(pluginDir, packageManager, options);
    }
    
    // Ensure the plugin.json is copied to the dist directory
    await copyPluginManifest(pluginDir);
    
    // Copy assets to the dist directory if they exist
    await copyAssets(pluginDir);
    
  } catch (error) {
    console.error(chalk.red('Error building plugin:'), error);
    throw error;
  }
}

/**
 * Check if the project uses webpack
 */
async function hasWebpack(pluginDir: string): Promise<boolean> {
  try {
    // Check if webpack.config.js exists
    await fs.access(path.join(pluginDir, 'webpack.config.js'));
    return true;
  } catch (error) {
    // No webpack.config.js
    return false;
  }
}

/**
 * Detect the package manager used in the project
 */
async function detectPackageManager(pluginDir: string): Promise<'npm' | 'yarn' | 'pnpm'> {
  try {
    // Check for yarn.lock
    await fs.access(path.join(pluginDir, 'yarn.lock'));
    return 'yarn';
  } catch (error) {
    // No yarn.lock
  }
  
  try {
    // Check for pnpm-lock.yaml
    await fs.access(path.join(pluginDir, 'pnpm-lock.yaml'));
    return 'pnpm';
  } catch (error) {
    // No pnpm-lock.yaml
  }
  
  // Default to npm
  return 'npm';
}

/**
 * Build the plugin with webpack
 */
async function buildWithWebpack(
  pluginDir: string,
  packageManager: 'npm' | 'yarn' | 'pnpm',
  options: BuildOptions
): Promise<void> {
  console.log(chalk.blue('🔨 Building with webpack...'));
  
  // Build the webpack command
  const webpackCommand = options.watch
    ? 'webpack --watch'
    : `webpack --mode ${options.production ? 'production' : 'development'}`;
  
  // Execute the command
  return new Promise((resolve, reject) => {
    const command = packageManager === 'npm'
      ? `npx ${webpackCommand}`
      : `${packageManager} ${webpackCommand}`;
    
    const build = spawn(command, {
      cwd: pluginDir,
      shell: true,
      stdio: 'inherit'
    });
    
    build.on('close', (code) => {
      if (code === 0) {
        if (!options.watch) {
          console.log(chalk.green('✅ Webpack build successful!'));
        }
        resolve();
      } else {
        reject(new Error(`Webpack build failed with code ${code}`));
      }
    });
    
    if (options.watch) {
      console.log(chalk.yellow('👀 Watching for changes...'));
      // For watch mode, we don't want to resolve the promise
      // as it will keep running
    }
  });
}

/**
 * Build the plugin using the package.json build script
 */
async function buildWithScript(
  pluginDir: string,
  packageManager: 'npm' | 'yarn' | 'pnpm',
  options: BuildOptions
): Promise<void> {
  console.log(chalk.blue('🔨 Building with package script...'));
  
  // Build the script command
  const scriptCommand = options.watch ? 'dev' : 'build';
  
  // Execute the command
  return new Promise((resolve, reject) => {
    const command = packageManager === 'npm'
      ? `npm run ${scriptCommand}`
      : `${packageManager} ${scriptCommand}`;
    
    const build = spawn(command, {
      cwd: pluginDir,
      shell: true,
      stdio: 'inherit'
    });
    
    build.on('close', (code) => {
      if (code === 0) {
        if (!options.watch) {
          console.log(chalk.green('✅ Script build successful!'));
        }
        resolve();
      } else {
        reject(new Error(`Script build failed with code ${code}`));
      }
    });
    
    if (options.watch) {
      console.log(chalk.yellow('👀 Watching for changes...'));
      // For watch mode, we don't want to resolve the promise
      // as it will keep running
    }
  });
}

/**
 * Build the plugin with TypeScript or JavaScript
 */
async function buildWithTypeScript(
  pluginDir: string,
  packageManager: 'npm' | 'yarn' | 'pnpm',
  options: BuildOptions
): Promise<void> {
  // Check if the project uses TypeScript
  let usesTypeScript = false;
  try {
    await fs.access(path.join(pluginDir, 'tsconfig.json'));
    usesTypeScript = true;
  } catch (error) {
    // No tsconfig.json, use JavaScript
  }
  
  if (usesTypeScript) {
    console.log(chalk.blue('🔨 Building with TypeScript...'));
    
    // Build the TypeScript command
    const tscCommand = options.watch
      ? 'tsc --watch'
      : 'tsc';
    
    // Execute the command
    return new Promise((resolve, reject) => {
      const command = packageManager === 'npm'
        ? `npx ${tscCommand}`
        : `${packageManager} ${tscCommand}`;
      
      const build = spawn(command, {
        cwd: pluginDir,
        shell: true,
        stdio: 'inherit'
      });
      
      build.on('close', (code) => {
        if (code === 0) {
          if (!options.watch) {
            console.log(chalk.green('✅ TypeScript build successful!'));
          }
          resolve();
        } else {
          reject(new Error(`TypeScript build failed with code ${code}`));
        }
      });
      
      if (options.watch) {
        console.log(chalk.yellow('👀 Watching for changes...'));
        // For watch mode, we don't want to resolve the promise
        // as it will keep running
      }
    });
  } else {
    console.log(chalk.blue('🔨 Building with JavaScript...'));
    
    // Create the dist directory
    await fs.mkdir(path.join(pluginDir, 'dist'), { recursive: true });
    
    // Copy JavaScript files to the dist directory
    const srcDir = path.join(pluginDir, 'src');
    
    // Check if src directory exists
    try {
      await fs.access(srcDir);
      
      // Copy files
      await copyDirectory(srcDir, path.join(pluginDir, 'dist'));
      
      console.log(chalk.green('✅ JavaScript files copied successfully!'));
      
      if (options.watch) {
        console.log(chalk.yellow('⚠️ Watch mode not supported for JavaScript projects.'));
      }
    } catch (error) {
      console.warn(chalk.yellow('⚠️ No src directory found.'));
    }
  }
}

/**
 * Copy the plugin.json manifest to the dist directory
 */
async function copyPluginManifest(pluginDir: string): Promise<void> {
  try {
    // Check if plugin.json exists
    await fs.access(path.join(pluginDir, 'plugin.json'));
    
    // Copy plugin.json to dist directory
    await fs.mkdir(path.join(pluginDir, 'dist'), { recursive: true });
    await fs.copyFile(
      path.join(pluginDir, 'plugin.json'),
      path.join(pluginDir, 'dist', 'plugin.json')
    );
    
    console.log(chalk.blue('📄 Copied plugin.json to dist directory'));
  } catch (error) {
    console.warn(chalk.yellow('⚠️ No plugin.json found.'));
  }
}

/**
 * Copy assets to the dist directory
 */
async function copyAssets(pluginDir: string): Promise<void> {
  try {
    // Check if assets directory exists
    const assetsDir = path.join(pluginDir, 'assets');
    await fs.access(assetsDir);
    
    // Create dist/assets directory
    const distAssetsDir = path.join(pluginDir, 'dist', 'assets');
    await fs.mkdir(distAssetsDir, { recursive: true });
    
    // Copy assets
    await copyDirectory(assetsDir, distAssetsDir);
    
    console.log(chalk.blue('🖼️ Copied assets to dist/assets directory'));
  } catch (error) {
    // No assets directory, that's fine
  }
}

/**
 * Copy a directory recursively
 */
async function copyDirectory(source: string, target: string): Promise<void> {
  // Create the target directory
  await fs.mkdir(target, { recursive: true });
  
  // Get all entries in the source directory
  const entries = await fs.readdir(source, { withFileTypes: true });
  
  // Process each entry
  for (const entry of entries) {
    const srcPath = path.join(source, entry.name);
    const destPath = path.join(target, entry.name);
    
    if (entry.isDirectory()) {
      // Recursively copy the directory
      await copyDirectory(srcPath, destPath);
    } else {
      // Copy the file
      await fs.copyFile(srcPath, destPath);
    }
  }
}
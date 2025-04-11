/**
 * Plugin Testing Utility
 * 
 * Provides a testing environment for plugin validation and unit testing.
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { spawn } from 'child_process';
import chalk from 'chalk';
import { buildPlugin } from '../cli/build-plugin';

/**
 * Testing options
 */
export interface TestOptions {
  /** Test UI components */
  ui?: boolean;
  
  /** Watch for changes */
  watch?: boolean;
}

/**
 * Test a plugin project
 * 
 * @param pluginDir Plugin directory
 * @param options Test options
 */
export async function testPlugin(pluginDir: string, options: TestOptions = {}): Promise<void> {
  try {
    // Check if package.json exists
    const packageJsonPath = path.join(pluginDir, 'package.json');
    await fs.access(packageJsonPath);
    
    // Read package.json to check for test script
    const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8');
    const packageJson = JSON.parse(packageJsonContent);
    
    // Check if the project has test script
    if (packageJson.scripts && packageJson.scripts.test) {
      // Build the plugin first
      console.log(chalk.blue('🔨 Building plugin for testing...'));
      await buildPlugin(pluginDir, { production: false });
      
      // Determine the package manager
      const packageManager = await detectPackageManager(pluginDir);
      
      // Determine the test command
      let testCommand = 'test';
      
      if (options.ui) {
        testCommand = packageJson.scripts['test:ui'] ? 'test:ui' : testCommand;
      }
      
      if (options.watch) {
        testCommand = packageJson.scripts['test:watch'] ? 'test:watch' : testCommand;
      }
      
      // Execute the test command
      console.log(chalk.blue(`🧪 Running ${testCommand} script...`));
      
      await executeTestCommand(pluginDir, packageManager, testCommand);
    } else {
      // If there's no test script, run Jest directly
      console.log(chalk.blue('🧪 No test script found, running Jest...'));
      
      // Check if Jest is installed
      const jestConfig = path.join(pluginDir, 'jest.config.js');
      let hasJestConfig = false;
      
      try {
        await fs.access(jestConfig);
        hasJestConfig = true;
      } catch (error) {
        // No Jest config, that's fine
      }
      
      if (hasJestConfig) {
        // Determine the package manager
        const packageManager = await detectPackageManager(pluginDir);
        
        // Execute Jest directly
        const jestCommand = options.watch ? 'jest --watch' : 'jest';
        
        await executeCommand(
          pluginDir,
          packageManager === 'npm' ? `npx ${jestCommand}` : `${packageManager} ${jestCommand}`
        );
      } else {
        // Create a mock test harness
        console.log(chalk.yellow('⚠️ No Jest configuration found, creating a test harness...'));
        
        await createTestHarness(pluginDir);
        await runTestHarness(pluginDir);
      }
    }
  } catch (error) {
    console.error(chalk.red('Error testing plugin:'), error);
    throw error;
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
 * Execute a test command using the package manager
 */
async function executeTestCommand(
  pluginDir: string,
  packageManager: 'npm' | 'yarn' | 'pnpm',
  command: string
): Promise<void> {
  const cmd = packageManager === 'npm'
    ? `npm run ${command}`
    : `${packageManager} ${command}`;
  
  await executeCommand(pluginDir, cmd);
}

/**
 * Execute a shell command
 */
async function executeCommand(pluginDir: string, command: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const process = spawn(command, {
      cwd: pluginDir,
      shell: true,
      stdio: 'inherit'
    });
    
    process.on('close', (code) => {
      if (code === 0) {
        console.log(chalk.green('✅ Tests completed successfully!'));
        resolve();
      } else {
        reject(new Error(`Tests failed with code ${code}`));
      }
    });
  });
}

/**
 * Create a test harness for the plugin
 */
async function createTestHarness(pluginDir: string): Promise<void> {
  // Create a tests directory if it doesn't exist
  const testsDir = path.join(pluginDir, 'tests');
  await fs.mkdir(testsDir, { recursive: true });
  
  // Read the plugin manifest
  const manifestPath = path.join(pluginDir, 'plugin.json');
  let manifest;
  
  try {
    const manifestContent = await fs.readFile(manifestPath, 'utf-8');
    manifest = JSON.parse(manifestContent);
  } catch (error) {
    throw new Error(`Failed to read plugin.json: ${error}`);
  }
  
  // Create a mock host environment
  const mockHostPath = path.join(testsDir, 'mockHost.js');
  
  // Check if the mock host already exists
  try {
    await fs.access(mockHostPath);
  } catch (error) {
    // Create the mock host
    const mockHostContent = `/**
 * Mock host environment for testing plugins
 */

const fs = require('fs');
const path = require('path');

// Load the plugin manifest
const manifestPath = path.join(__dirname, '..', 'plugin.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

// Create a mock API
const mockApi = {
  model: {
    getEntities: jest.fn().mockResolvedValue([]),
    getEntityById: jest.fn().mockResolvedValue(null),
    getSelection: jest.fn().mockResolvedValue([]),
    setSelection: jest.fn().mockResolvedValue(void 0),
    // Add more mock methods as needed
  },
  ui: {
    showNotification: jest.fn().mockResolvedValue(void 0),
    showDialog: jest.fn().mockResolvedValue({ buttonId: 'ok', cancelled: false }),
    // Add more mock methods as needed
  },
  file: {
    readTextFile: jest.fn().mockResolvedValue(''),
    // Add more mock methods as needed
  },
  host: {
    log: jest.fn(),
    getMetadata: jest.fn().mockReturnValue({
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
      author: manifest.author,
      permissions: manifest.permissions || [],
    }),
    notifyReady: jest.fn().mockResolvedValue(void 0),
    // Add more mock methods as needed
  },
  // Add more API sections as needed
};

// Create a mock initialization context
const mockContext = {
  metadata: {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    description: manifest.description,
    author: manifest.author,
    permissions: manifest.permissions || [],
  },
  onDeactivation: jest.fn(),
};

module.exports = {
  mockApi,
  mockContext,
  manifest,
};
`;
    
    await fs.writeFile(mockHostPath, mockHostContent);
  }
  
  // Create a test file for the plugin
  const testFilePath = path.join(testsDir, 'plugin.test.js');
  
  // Check if the test file already exists
  try {
    await fs.access(testFilePath);
  } catch (error) {
    // Create the test file
    const testFileContent = `/**
 * Tests for the ${manifest.name} plugin
 */

const path = require('path');
const { mockApi, mockContext, manifest } = require('./mockHost');

// Import the plugin
const pluginPath = path.join(__dirname, '..', manifest.main);
let plugin;

try {
  plugin = require(pluginPath);
} catch (error) {
  console.error(\`Error importing plugin: \${error.message}\`);
  // If we can't require directly, handle it gracefully
  plugin = {
    initialize: jest.fn(),
    activate: jest.fn(),
    deactivate: jest.fn(),
  };
}

describe('${manifest.name} Plugin', () => {
  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
  });
  
  test('Plugin should be properly defined', () => {
    expect(plugin).toBeDefined();
    expect(manifest).toBeDefined();
    expect(manifest.id).toBe('${manifest.id}');
  });
  
  test('Plugin should initialize correctly', async () => {
    // Skip if initialize is not defined
    if (typeof plugin.initialize !== 'function') {
      console.log('Plugin does not have an initialize method, skipping test');
      return;
    }
    
    await plugin.initialize(mockContext, mockApi);
    expect(mockContext.onDeactivation).toHaveBeenCalled();
  });
  
  test('Plugin should activate correctly', async () => {
    // Skip if activate is not defined
    if (typeof plugin.activate !== 'function') {
      console.log('Plugin does not have an activate method, skipping test');
      return;
    }
    
    await plugin.activate(mockApi);
    expect(mockApi.host.notifyReady).toHaveBeenCalled();
  });
  
  test('Plugin should deactivate correctly', async () => {
    // Skip if deactivate is not defined
    if (typeof plugin.deactivate !== 'function') {
      console.log('Plugin does not have a deactivate method, skipping test');
      return;
    }
    
    await plugin.deactivate();
    // Add specific expectations for deactivation if needed
  });
  
  // Add more tests specific to your plugin
});
`;
    
    await fs.writeFile(testFilePath, testFileContent);
  }
  
  // Create a Jest config file
  const jestConfigPath = path.join(pluginDir, 'jest.config.js');
  
  // Check if the Jest config already exists
  try {
    await fs.access(jestConfigPath);
  } catch (error) {
    // Create the Jest config
    const jestConfigContent = `/**
 * Jest configuration for plugin testing
 */

module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  transform: {},
};
`;
    
    await fs.writeFile(jestConfigPath, jestConfigContent);
  }
  
  // Add test script to package.json
  const packageJsonPath = path.join(pluginDir, 'package.json');
  const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8');
  const packageJson = JSON.parse(packageJsonContent);
  
  if (!packageJson.scripts) {
    packageJson.scripts = {};
  }
  
  if (!packageJson.scripts.test) {
    packageJson.scripts.test = 'jest';
    
    // Write the updated package.json
    await fs.writeFile(
      packageJsonPath,
      JSON.stringify(packageJson, null, 2)
    );
  }
  
  console.log(chalk.green('✅ Test harness created successfully!'));
}

/**
 * Run the test harness
 */
async function runTestHarness(pluginDir: string): Promise<void> {
  // Check if Jest is installed
  let hasJest = false;
  
  const packageJsonPath = path.join(pluginDir, 'package.json');
  const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8');
  const packageJson = JSON.parse(packageJsonContent);
  
  if (
    (packageJson.dependencies && packageJson.dependencies.jest) || 
    (packageJson.devDependencies && packageJson.devDependencies.jest)
  ) {
    hasJest = true;
  }
  
  if (!hasJest) {
    console.log(chalk.yellow('⚠️ Jest is not installed. Installing...'));
    
    // Determine the package manager
    const packageManager = await detectPackageManager(pluginDir);
    
    // Install Jest
    const installCmd = packageManager === 'npm'
      ? 'npm install --save-dev jest'
      : packageManager === 'yarn'
        ? 'yarn add --dev jest'
        : 'pnpm add --save-dev jest';
    
    await executeCommand(pluginDir, installCmd);
  }
  
  // Run Jest
  console.log(chalk.blue('🧪 Running tests with Jest...'));
  
  const packageManager = await detectPackageManager(pluginDir);
  const jestCmd = packageManager === 'npm'
    ? 'npx jest'
    : `${packageManager} jest`;
  
  await executeCommand(pluginDir, jestCmd);
}
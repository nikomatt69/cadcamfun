const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const PLUGINS_DIR = path.join(process.cwd(), 'public', 'plugins');

// Copy non-TypeScript files
function copyAdditionalFiles(pluginDir, distDir) {
  const files = fs.readdirSync(pluginDir);
  files.forEach(file => {
    const filePath = path.join(pluginDir, file);
    if (fs.statSync(filePath).isFile() && 
        !file.endsWith('.ts') && 
        !file.endsWith('.tsx') &&
        !file.endsWith('.jsx') &&
        file !== 'index.js' &&
        file !== 'index.js.map' &&
        // Don't copy CSS directly, they will be handled by esbuild
        !file.endsWith('.css')) { 
      const destPath = path.join(distDir, file);
      fs.copyFileSync(filePath, destPath);
    }
  });

  // Copy component and operation files
  ['components', 'operations'].forEach(dir => {
    const srcDir = path.join(pluginDir, dir);
    if (fs.existsSync(srcDir)) {
      const destDir = path.join(distDir, dir);
      ensureDirectoryExists(destDir);
      const files = fs.readdirSync(srcDir);
      files.forEach(file => {
        if (!file.endsWith('.ts') && !file.endsWith('.tsx') && !file.endsWith('.css')) {
          fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
        }
      });
    }
  });
}

// Ensure directory exists
function ensureDirectoryExists(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// Clean directory
function cleanDirectory(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true });
  }
  ensureDirectoryExists(dir);
}

// Compile TypeScript files for each plugin
async function buildPlugins() {
  // Get all plugin directories
  const pluginDirs = fs.readdirSync(PLUGINS_DIR)
    .filter(dir => fs.statSync(path.join(PLUGINS_DIR, dir)).isDirectory());

  for (const pluginDir of pluginDirs) {
    console.log(`Building plugin: ${pluginDir}`);
    
    const pluginPath = path.join(PLUGINS_DIR, pluginDir);
    const srcPath = path.join(pluginPath, 'src'); // Define the source path
    let entryPointPath; // Variable to hold the full path to the entry point
    let sourceDir; // Directory where the entry point and related source files are located

    // Check for entry points inside the 'src' directory first
    if (fs.existsSync(path.join(srcPath, 'index.tsx'))) {
      entryPointPath = path.join(srcPath, 'index.tsx');
      sourceDir = srcPath; // Source files are in src/
    } else if (fs.existsSync(path.join(srcPath, 'index.ts'))) {
      entryPointPath = path.join(srcPath, 'index.ts');
      sourceDir = srcPath; // Source files are in src/
    } 
    // Fallback to checking the plugin root directory
    else if (fs.existsSync(path.join(pluginPath, 'index.tsx'))) {
      entryPointPath = path.join(pluginPath, 'index.tsx');
      sourceDir = pluginPath; // Source files are in root
    } else if (fs.existsSync(path.join(pluginPath, 'index.jsx'))) {
      entryPointPath = path.join(pluginPath, 'index.jsx');
      sourceDir = pluginPath; // Source files are in root
    } else if (fs.existsSync(path.join(pluginPath, 'index.ts'))) {
      entryPointPath = path.join(pluginPath, 'index.ts');
      sourceDir = pluginPath; // Source files are in root
    } else if (fs.existsSync(path.join(pluginPath, 'index.js'))) {
      entryPointPath = path.join(pluginPath, 'index.js');
      sourceDir = pluginPath; // Source files are in root
    } else {
      // Read manifest to get the declared entry point for a better error message
      let declaredEntryPoint = 'N/A';
      const manifestPath = path.join(pluginPath, 'manifest.json');
      if (fs.existsSync(manifestPath)) {
        try {
          const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
          declaredEntryPoint = manifest.entryPoint || 'N/A';
        } catch (e) { /* Ignore parse error */ }
      }
      throw new Error(`No valid entry point found for plugin ${pluginDir}. Looked in src/ and root. Declared in manifest: ${declaredEntryPoint}`);
    }
    
    const distPath = path.join(pluginPath, 'dist'); // Define the dist path

    try {
      // Always clean the dist directory first to avoid stale files
      cleanDirectory(distPath);

      await esbuild.build({
        entryPoints: [entryPointPath],
        bundle: true,
        outfile: path.join(distPath, 'index.js'),
        format: 'esm',
        platform: 'browser',
        target: ['es2020'],
        sourcemap: 'inline',
        loader: {
          '.ts': 'tsx',
          '.tsx': 'tsx',
          '.js': 'jsx',
          '.jsx': 'jsx',
          '.css': 'css',
          '.svg': 'dataurl',
          '.png': 'dataurl',
          '.jpg': 'dataurl',
          '.jpeg': 'dataurl',
          '.gif': 'dataurl'
        },
        jsxFactory: 'React.createElement',
        jsxFragment: 'React.Fragment',
        external: ['react', 'react-dom'],
        define: {
          'process.env.NODE_ENV': '"production"'
        },
        // Important: ensure CSS modules are handled as part of the JS bundle
        // This prevents global CSS files from being generated
        assetNames: '[name]',
        publicPath: '/plugins/' + pluginDir + '/dist',
        metafile: true,
        minify: true
      }).then(result => {
        // Copy metafile for debugging if needed
        fs.writeFileSync(
          path.join(distPath, 'meta.json'),
          JSON.stringify(result.metafile)
        );
      });
      
      // Copy additional files from the determined source directory to dist
      if (sourceDir && fs.existsSync(sourceDir)) { // Check if sourceDir was set and exists
          copyAdditionalFiles(sourceDir, distPath); // Copy from the correct sourceDir
      } else {
          console.warn(`Warning: Source directory not found or determined for ${pluginDir}. Skipping copying additional files.`);
      }
      
      // Copy manifest to dist
      const manifestSrcPath = path.join(pluginPath, 'manifest.json');
      if (fs.existsSync(manifestSrcPath)) {
        fs.copyFileSync(manifestSrcPath, path.join(distPath, 'manifest.json'));
      }

      console.log(`Successfully built ${pluginDir}`);
    } catch (error) {
      console.error(`Failed to build ${pluginDir}:`, error);
      process.exit(1);
    }
  }
}

buildPlugins().catch(error => {
  console.error('Build failed:', error);
  process.exit(1);
});
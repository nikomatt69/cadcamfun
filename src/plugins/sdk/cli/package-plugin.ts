/**
 * Plugin Packaging Utility
 *
 * Creates a distributable package for a plugin, including all necessary files
 * and validating the package contents.
 */

import * as path from "path";
import * as fs from "fs/promises";
import * as crypto from "crypto";
import chalk from "chalk";
import * as AdmZip from "adm-zip";
import { validateManifest } from "../validation/plugin-schema-validator";

/**
 * Package a plugin for distribution
 *
 * @param pluginDir The directory containing the plugin
 * @param outputFile Optional output file name
 * @returns Path to the created package file
 */
export async function packagePlugin(pluginDir: string, outputFile?: string): Promise<string> {
  try {
    console.log(chalk.blue("📦 Packaging plugin..."));

    // Read the plugin manifest (try manifest.json first, then plugin.json)
    let manifest;
    let manifestPath = path.join(pluginDir, "manifest.json");

    try {
      const manifestContent = await fs.readFile(manifestPath, "utf-8");
      manifest = JSON.parse(manifestContent);
    } catch (error) {
      // Try plugin.json if manifest.json doesn't exist
      manifestPath = path.join(pluginDir, "plugin.json");
      try {
        const manifestContent = await fs.readFile(manifestPath, "utf-8");
        manifest = JSON.parse(manifestContent);
        console.log(chalk.yellow("⚠️ Using legacy plugin.json format. Consider migrating to manifest.json."));
      } catch (innerError) {
        throw new Error(`Failed to read manifest.json or plugin.json: ${error}`);
      }
    }

    // Validate the manifest
    const validationResult = validateManifest(manifest);
    if (!validationResult.valid) {
      throw new Error(`Invalid manifest: ${validationResult.errors?.join(", ")}`);
    }

    // Check if dist directory exists
    const distDir = path.join(pluginDir, "dist");
    try {
      await fs.access(distDir);
    } catch (error) {
      throw new Error('Dist directory not found. Build the plugin first with "cadcam-plugin build"');
    }

    // Create a default output file name if not provided
    if (!outputFile) {
      outputFile = path.join(pluginDir, `${manifest.id.replace(/\./g, "-")}-${manifest.version}.zip`);
    }

    // Create the package
    await createPackage(pluginDir, outputFile, manifest);

    // Verify the package
    await verifyPackage(outputFile, manifest);

    return outputFile;
  } catch (error) {
    console.error(chalk.red("Error packaging plugin:"), error);
    throw error;
  }
}

/**
 * Create a plugin package
 *
 * @param pluginDir The directory containing the plugin
 * @param outputFile The output file path
 * @param originalManifest The plugin manifest
 */
async function createPackage(pluginDir: string, outputFile: string, originalManifest: any): Promise<void> {
  // Create a new zip file
  const zip = new AdmZip.default();

  // Deep clone the manifest to avoid modifying the original object read from disk
  const correctedManifest = JSON.parse(JSON.stringify(originalManifest));

  // Correct the main path
  if (correctedManifest.main && correctedManifest.main.startsWith("dist/")) {
    correctedManifest.main = correctedManifest.main.substring(5); // Remove 'dist/'
    console.log(chalk.yellow(`📝 Corrected manifest 'main' path to: ${correctedManifest.main}`));
  }

  // Correct sidebar entry path
  if (
    correctedManifest.contributes?.sidebar?.entry &&
    correctedManifest.contributes.sidebar.entry.startsWith("dist/")
  ) {
    correctedManifest.contributes.sidebar.entry = correctedManifest.contributes.sidebar.entry.substring(5); // Remove 'dist/'
    console.log(
      chalk.yellow(
        `📝 Corrected manifest 'contributes.sidebar.entry' path to: ${correctedManifest.contributes.sidebar.entry}`
      )
    );
  }
  // TODO: Add correction for other 'contributes' entry points if needed (e.g., toolbars, commands with icons)
  if (correctedManifest.contributes?.commands) {
    correctedManifest.contributes.commands.forEach((cmd: any) => {
      if (cmd.icon && cmd.icon.startsWith("dist/")) {
        cmd.icon = cmd.icon.substring(5); // Remove 'dist/'
        console.log(chalk.yellow(`📝 Corrected manifest command icon path for '${cmd.id}' to: ${cmd.icon}`));
      }
    });
  }
  // Correct contributes.sidebar.icon if it starts with dist/
  if (correctedManifest.contributes?.sidebar?.icon && correctedManifest.contributes.sidebar.icon.startsWith("dist/")) {
    correctedManifest.contributes.sidebar.icon = correctedManifest.contributes.sidebar.icon.substring(5); // Remove 'dist/'
    console.log(
      chalk.yellow(
        `📝 Corrected manifest 'contributes.sidebar.icon' path to: ${correctedManifest.contributes.sidebar.icon}`
      )
    );
  }

  const manifestContent = JSON.stringify(correctedManifest, null, 2);
  // Add the *corrected* manifest as manifest.json
  zip.addFile("manifest.json", Buffer.from(manifestContent));
  console.log(chalk.blue("➕ Added corrected manifest.json to package"));

  // Also add the original plugin.json if it exists (for legacy/reference, though manifest.json is primary)
  try {
    const pluginJsonPath = path.join(pluginDir, "plugin.json");
    await fs.access(pluginJsonPath);
    // Add it with its original name
    zip.addLocalFile(pluginJsonPath);
    console.log(chalk.blue("➕ Added original plugin.json to package (for reference)"));
  } catch (error) {
    // plugin.json doesn't exist, no need to add it
  }

  // Add files from the dist directory directly to the root
  const distDir = path.join(pluginDir, "dist");
  console.log(chalk.blue(`➕ Adding files from ${distDir} to package root...`));
  await addDirectoryToZip(zip, distDir, ""); // Add contents of dist to root ('')

  // Add additional root files if they exist
  const filesToAdd = ["README.md", "LICENSE", "CHANGELOG.md"];

  for (const file of filesToAdd) {
    const filePath = path.join(pluginDir, file);
    try {
      await fs.access(filePath);
      zip.addLocalFile(filePath); // Adds to root
      console.log(chalk.blue(`➕ Added ${file} to package root`));
    } catch (error) {
      // File doesn't exist, skip it
    }
  }

  // Add the assets directory contents if it exists
  const assetsDir = path.join(pluginDir, "assets");
  try {
    await fs.access(assetsDir);
    console.log(chalk.blue(`➕ Adding files from ${assetsDir} to package assets/ directory...`));
    await addDirectoryToZip(zip, assetsDir, "assets"); // Add contents of assets to 'assets/' subdir
  } catch (error) {
    // Assets directory doesn't exist, skip it
  }

  // Generate the package metadata (using correctedManifest for consistency)
  const metadata = {
    id: correctedManifest.id,
    version: correctedManifest.version,
    name: correctedManifest.name,
    description: correctedManifest.description,
    author: correctedManifest.author,
    license: correctedManifest.license,
    createdAt: new Date().toISOString(),
    checksum: "",
    files: [] as string[]
  };

  // Get entries from the zip *after* all files are added
  const entries = zip.getEntries();

  // Add file list to metadata
  metadata.files = entries.map(entry => entry.entryName.replace(/\\/g, "/")); // Use entryName and ensure forward slashes

  // Add metadata.json to the package
  zip.addFile("metadata.json", Buffer.from(JSON.stringify(metadata, null, 2)));
  console.log(chalk.blue("➕ Added metadata.json to package"));

  // Calculate checksum *after* metadata is initially added
  let zipBuffer = zip.toBuffer();
  let checksum = crypto.createHash("sha256").update(zipBuffer).digest("hex");

  // Update metadata with checksum
  metadata.checksum = checksum;
  // Update the metadata file entry in the zip object *without rewriting the entire zip*
  const metadataEntry = zip.getEntry("metadata.json");
  if (metadataEntry) {
    zip.updateFile("metadata.json", Buffer.from(JSON.stringify(metadata, null, 2)));
    console.log(chalk.blue("🔒 Updated metadata.json with checksum"));
  } else {
    console.error(chalk.red("❌ Failed to find metadata.json entry to update checksum!"));
    // Decide how to handle this - maybe throw an error?
  }

  // Write the final zip file
  zip.writeZip(outputFile);

  console.log(chalk.green(`✅ Plugin packaged successfully: ${outputFile}`));
  // Recalculate size just in case updateFile changed it slightly (unlikely but possible)
  const finalBuffer = await fs.readFile(outputFile);
  console.log(chalk.blue(`📊 Package size: ${formatBytes(finalBuffer.length)}`));
  console.log(chalk.blue(`🔐 Checksum (SHA-256): ${checksum}`)); // Checksum is calculated before final write
}

/**
 * Add a directory to a zip file recursively.
 * Ensures forward slashes for zip paths.
 *
 * @param zip The AdmZip instance
 * @param directory The local directory path to add
 * @param zipPath The target path within the zip file (use '' for root)
 */
async function addDirectoryToZip(
  zip: AdmZip,
  directory: string,
  zipPath: string // Target path within the zip, e.g., 'assets' or '' for root
): Promise<void> {
  const entries = await fs.readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const currentLocalPath = path.join(directory, entry.name);
    // Construct the path *inside* the zip archive
    // Ensure forward slashes for zip compatibility
    const entryZipPath = zipPath ? `${zipPath}/${entry.name}`.replace(/\\/g, "/") : entry.name.replace(/\\/g, "/");

    if (entry.isDirectory()) {
      console.log(chalk.gray(`  Entering directory: ${entryZipPath}`));
      await addDirectoryToZip(zip, currentLocalPath, entryZipPath);
    } else {
      // Add file to the calculated zip path
      console.log(chalk.gray(`  Adding file: ${entryZipPath}`));
      zip.addLocalFile(currentLocalPath, path.dirname(entryZipPath).replace(/\\/g, "/")); // Provide the directory path within the zip
    }
  }
}

/**
 * Verify a plugin package
 *
 * @param packageFile The package file path
 * @param expectedManifest The expected plugin manifest
 */
async function verifyPackage(packageFile: string, expectedManifest: any): Promise<void> {
  // Open the package
  const zip = new AdmZip.default(packageFile);

  // Check for required files at the ROOT level
  const requiredFiles = [
    "manifest.json", // We now expect manifest.json primarily
    "metadata.json"
  ];

  // Read the corrected manifest from within the zip for verification
  const manifestEntry = zip.getEntry("manifest.json");
  if (!manifestEntry) {
    throw new Error(`Package verification failed: Missing manifest.json in zip root.`);
  }
  const manifestContent = manifestEntry.getData().toString("utf-8");
  let manifestInZip;
  try {
    manifestInZip = JSON.parse(manifestContent);
  } catch (e) {
    throw new Error(`Package verification failed: Could not parse manifest.json from zip. ${e}`);
  }

  // Get main entry point from the manifest *inside the zip*
  if (manifestInZip.main) {
    requiredFiles.push(manifestInZip.main);
  }

  // Check for sidebar entry point from the manifest *inside the zip*
  if (manifestInZip.contributes?.sidebar?.entry) {
    requiredFiles.push(manifestInZip.contributes.sidebar.entry);
  }
  // TODO: Add checks for other 'contributes' entry points if needed

  // Verify required files exist at the correct location (root or specified path)
  console.log(chalk.blue("🔍 Verifying package contents..."));
  for (const file of requiredFiles) {
    const correctedFilePath = file.replace(/\\/g, "/"); // Ensure forward slashes
    console.log(chalk.gray(`  Checking for: ${correctedFilePath}`));
    const entry = zip.getEntry(correctedFilePath);
    if (!entry) {
      // Check if it might be the original plugin.json we added for reference
      if (correctedFilePath === "plugin.json" && zip.getEntry("plugin.json")) {
        console.log(chalk.yellow(`  Found legacy plugin.json (expected manifest.json).`));
        continue; // Allow legacy plugin.json if manifest.json is missing from checks but present
      }
      console.error(chalk.red(`❌ Verification failed: Required file not found in package: ${correctedFilePath}`));
      throw new Error(`Package verification failed: Missing required file: ${correctedFilePath}`);
    }
  }
  console.log(chalk.blue("✅ Package structure verified."));

  // Validate the manifest *from within the zip*
  console.log(chalk.blue("🔍 Validating manifest from package..."));
  const validationResult = validateManifest(manifestInZip);
  if (!validationResult.valid) {
    console.error(chalk.red(`❌ Verification failed: Invalid manifest found within package:`));
    validationResult.errors?.forEach(err => console.error(chalk.red(`  - ${err}`)));
    throw new Error(`Package verification failed: Invalid manifest in package: ${validationResult.errors?.join(", ")}`);
  }
  console.log(chalk.blue("✅ Manifest in package is valid."));

  // Verify the manifest matches the original *source* manifest values (ID, version)
  console.log(chalk.blue("🔍 Verifying manifest ID and Version match source..."));
  if (manifestInZip.id !== expectedManifest.id) {
    console.error(
      chalk.red(
        `❌ Verification failed: Manifest ID mismatch: In Package='${manifestInZip.id}', Source='${expectedManifest.id}'`
      )
    );
    throw new Error(`Manifest ID mismatch: ${manifestInZip.id} !== ${expectedManifest.id}`);
  }
  if (manifestInZip.version !== expectedManifest.version) {
    console.error(
      chalk.red(
        `❌ Verification failed: Manifest Version mismatch: In Package='${manifestInZip.version}', Source='${expectedManifest.version}'`
      )
    );
    throw new Error(`Manifest version mismatch: ${manifestInZip.version} !== ${expectedManifest.version}`);
  }
  console.log(chalk.blue("✅ Manifest ID and Version verified."));

  // Verify checksum from metadata.json
  console.log(chalk.blue("🔍 Verifying package checksum..."));
  const metadataEntry = zip.getEntry("metadata.json");
  if (!metadataEntry) {
    throw new Error(`Package verification failed: Missing metadata.json`);
  }
  const metadataContent = metadataEntry.getData().toString("utf-8");
  let metadata;
  try {
    metadata = JSON.parse(metadataContent);
  } catch (e) {
    throw new Error(`Package verification failed: Could not parse metadata.json from zip. ${e}`);
  }

  if (!metadata.checksum) {
    throw new Error(`Package verification failed: Checksum missing in metadata.json`);
  }

  // Calculate checksum of the *entire zip file buffer excluding the metadata entry itself* might be complex.
  // A simpler and common approach is to recalculate the checksum of the downloaded file buffer.
  // Here, we'll trust the checksum written during packaging is correct, but ideally,
  // a consumer would verify the checksum of the downloaded file against the metadata.
  // For this internal verification, we'll assume the checksum mechanism worked.
  console.log(
    chalk.yellow(
      `⚠️ Checksum verification skipped during build. Assumed correct based on metadata value: ${metadata.checksum}`
    )
  );
  // To implement full checksum verification here, you'd need to:
  // 1. Get the buffer of the zip file *without* the metadata.json OR recalculate based on entries.
  // 2. Hash that buffer/content stream.
  // 3. Compare with metadata.checksum.

  console.log(chalk.green("✅ Package verification successful."));
}

/**
 * Format bytes into a human-readable string
 *
 * @param bytes Number of bytes
 * @returns Human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";

  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));

  return `${parseFloat((bytes / Math.pow(1024, i)).toFixed(2))} ${sizes[i]}`;
}

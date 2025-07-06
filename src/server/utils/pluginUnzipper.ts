import fsPromises from "fs/promises";
import fs from "fs";
import path from "path";
import unzipper from "unzipper";
import { PluginManifest } from "@/src/plugins/core/registry";

/**
 * Extracts a plugin zip archive to a target directory and reads the manifest.
 * @param zipFilePath Path to the .zip file.
 * @param targetDir Directory to extract contents into.
 * @returns The parsed PluginManifest.
 */
export async function unzipPluginPackage(zipFilePath: string, targetDir: string): Promise<PluginManifest> {
  console.log(`[Unzipper] Starting extraction from ${zipFilePath} to ${targetDir}`);
  await fsPromises.mkdir(targetDir, { recursive: true });

  const stream = fs.createReadStream(zipFilePath);
  let manifest: PluginManifest | null = null;

  return new Promise((resolve, reject) => {
    stream
      .pipe(unzipper.Extract({ path: targetDir }))
      .on("error", (err: Error) => {
        console.error(`[Unzipper] Error during extraction:`, err);
        reject(new Error(`Failed to extract plugin archive: ${err.message}`));
      })
      .on("close", async () => {
        console.log(`[Unzipper] Extraction complete for ${zipFilePath}`);
        let manifestPath: string | null = null;
        try {
          // Log the contents of the target directory
          const extractedItems = await fsPromises.readdir(targetDir);
          console.log(`[Unzipper] Contents of extracted directory (${targetDir}):`, extractedItems);

          // Attempt 1: Check root directory
          const rootManifestPath = path.join(targetDir, "manifest.json");
          try {
            await fsPromises.access(rootManifestPath, fs.constants.R_OK); // Check if readable
            manifestPath = rootManifestPath;
            console.log(`[Unzipper] Found manifest.json at root: ${manifestPath}`);
          } catch (rootAccessError) {
            // Manifest not found at root, check one level deeper
            console.log(`[Unzipper] manifest.json not found at root. Checking subdirectories...`);
            const items = await fsPromises.readdir(targetDir, { withFileTypes: true });
            console.log(
              `[Unzipper] Found items in root:`,
              items.map(item => `${item.name}${item.isDirectory() ? "/" : ""}`)
            ); // Log names and types

            // Filter out __MACOSX and look for exactly one remaining directory
            const relevantSubDirs = items.filter(item => item.isDirectory() && item.name !== "__MACOSX");

            // Log the filtered directories
            console.log(
              `[Unzipper] Filtered subdirectories (excluding __MACOSX):`,
              relevantSubDirs.map(dir => dir.name)
            );

            if (relevantSubDirs.length === 1) {
              const subDirName = relevantSubDirs[0].name;
              console.log(`[Unzipper] Found single relevant subdirectory: ${subDirName}`);
              const subDirManifestPath = path.join(targetDir, subDirName, "manifest.json");
              try {
                await fsPromises.access(subDirManifestPath, fs.constants.R_OK);
                manifestPath = subDirManifestPath;
                console.log(`[Unzipper] Found manifest.json in subdirectory: ${manifestPath}`);
              } catch (subDirAccessError) {
                console.log(`[Unzipper] manifest.json not found in subdirectory ${subDirName}.`);
                // Fall through to reject below
              }
            } else {
              console.log(
                `[Unzipper] Expected exactly one relevant subdirectory (excluding __MACOSX), found ${relevantSubDirs.length}.`
              );
              // Fall through to reject below
            }
          }

          if (!manifestPath) {
            throw new Error("manifest.json not found in package root or a single valid sub-directory.");
          }

          // Read and parse the found manifest
          const manifestContent = await fsPromises.readFile(manifestPath, "utf-8");
          manifest = JSON.parse(manifestContent);

          // Basic validation
          if (!manifest || !manifest.id || !manifest.version || !manifest.main) {
            throw new Error("Extracted manifest is missing required fields (id, version, main).");
          }
          console.log(`[Unzipper] Manifest parsed successfully for ${manifest.id}`);
          resolve(manifest);
        } catch (readError) {
          console.error(`[Unzipper] Error reading/parsing manifest after extraction:`, readError);
          reject(
            new Error(
              `Failed to read or parse manifest.json after extraction: ${readError instanceof Error ? readError.message : String(readError)}`
            )
          );
        }
      });
  });
}

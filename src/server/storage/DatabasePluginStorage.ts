import { PluginRegistryEntry as DbPluginRegistryEntry } from "@prisma/client";
import { PluginStorageProvider } from "@/src/plugins/core/registry/pluginStorage"; // Assuming this interface exists
import { PluginRegistryEntry, PluginState } from "@/src/plugins/core/registry"; // Your internal type
import { PluginManifest } from "@/src/plugins/core/registry/pluginManifest"; // Your internal type
import { prisma } from "@/src/lib/prisma";

// Helper function to map DB model to internal type
function mapDbToInternalEntry(dbEntry: DbPluginRegistryEntry): PluginRegistryEntry {
  let manifest: PluginManifest;
  try {
    manifest = JSON.parse(dbEntry.manifestJson);
  } catch (e) {
    console.error(`Failed to parse manifest JSON for plugin ${dbEntry.id}:`, e);
    // Return a partial object or throw? For now, return partial with error indicated.
    return {
      ...dbEntry,
      manifest: {
        id: dbEntry.id,
        name: `Invalid Manifest (${dbEntry.id})`,
        version: dbEntry.version,
        main: "",
        description: "",
        author: "",
        engines: {
          cadcam: ""
        },
        permissions: []
      },
      state: PluginState.ERROR, // Set state to error
      lastError: "Failed to parse stored manifest JSON."
    };
  }

  return {
    ...dbEntry, // Includes id, enabled, version, dates, errors, etc.
    state: dbEntry.state as PluginState, // Cast the state to PluginState to fix type mismatch
    manifest: manifest,
    lastError: dbEntry.lastError === null ? undefined : dbEntry.lastError // Convert null to undefined to satisfy the expected type
    // Config is handled separately by getPluginConfig
  };
}

export class DatabasePluginStorage implements PluginStorageProvider {
  getPluginState(_pluginId: string): Promise<Record<string, any> | null> {
    throw new Error("Method not implemented.");
  }
  savePluginState(_pluginId: string, _state: Record<string, any>): Promise<void> {
    throw new Error("Method not implemented.");
  }

  async getPlugins(): Promise<PluginRegistryEntry[]> {
    console.log("[DatabasePluginStorage] Getting all plugins...");
    const dbEntries = await prisma.pluginRegistryEntry.findMany();
    return dbEntries.map(mapDbToInternalEntry);
  }

  async savePlugin(pluginEntry: PluginRegistryEntry): Promise<void> {
    console.log(`[DatabasePluginStorage] Saving plugin: ${pluginEntry.id}`);
    const { manifest, config, ...dbData } = pluginEntry; // Separate manifest/config

    try {
      await prisma.pluginRegistryEntry.upsert({
        where: { id: pluginEntry.id },
        update: {
          ...dbData,
          manifestJson: JSON.stringify(manifest) // Store manifest as string
        },
        create: {
          ...dbData,
          manifestJson: JSON.stringify(manifest) // Store manifest as string
        }
      });
      // Note: Configuration is saved separately via savePluginConfig
      console.log(`[DatabasePluginStorage] Upsert successful for plugin: ${pluginEntry.id}`);
      // Handle config saving separately if needed, maybe using savePluginConfig
      // if (config) {
      //     await this.savePluginConfig(pluginEntry.id, config);
      // }
    } catch (error) {
      // Check specifically for P2025 which might occur due to onDelete cascade
      if ((error as any)?.code === "P2025") {
        console.warn(
          `[DatabasePluginStorage] Prisma error P2025 during upsert for ${pluginEntry.id} (likely missing related config record, which is okay on create). Proceeding.`
        );
        // Potentially verify the main record was still created/updated if necessary
        const check = await prisma.pluginRegistryEntry.findUnique({ where: { id: pluginEntry.id } });
        if (!check) {
          console.error(
            `[DatabasePluginStorage] CRITICAL: Plugin ${pluginEntry.id} still not found after upsert despite P2025.`
          );
          throw new Error(`Failed to save plugin ${pluginEntry.id} even after handling P2025.`);
        }
      } else {
        // Re-throw other errors
        console.error(`[DatabasePluginStorage] Error saving plugin ${pluginEntry.id}:`, error);
        throw error;
      }
    }
  }

  async removePlugin(pluginId: string): Promise<void> {
    console.log(`[DatabasePluginStorage] Removing plugin: ${pluginId}`);
    try {
      // The relation's onDelete: Cascade should handle removing the config automatically
      await prisma.pluginRegistryEntry.delete({
        where: { id: pluginId }
      });
    } catch (error) {
      console.error(`[DatabasePluginStorage] Error removing plugin ${pluginId}:`, error);
      // Handle case where plugin might not exist (e.g., prisma throws P2025)
      if ((error as any)?.code === "P2025") {
        console.warn(`[DatabasePluginStorage] Plugin ${pluginId} not found for removal.`);
        return; // Not an error if it's already gone
      }
      throw error; // Re-throw other errors
    }
  }

  async getPluginConfig(pluginId: string): Promise<{ [key: string]: any } | null> {
    console.log(`[DatabasePluginStorage] Getting config for plugin: ${pluginId}`);
    const dbConfig = await prisma.pluginConfiguration.findUnique({
      where: { pluginId: pluginId }
    });

    if (!dbConfig) {
      return null;
    }

    try {
      return JSON.parse(dbConfig.configJson);
    } catch (e) {
      console.error(`Failed to parse config JSON for plugin ${pluginId}:`, e);
      return null; // Return null or maybe an error indicator?
    }
  }

  async savePluginConfig(pluginId: string, config: { [key: string]: any }): Promise<void> {
    console.log(`[DatabasePluginStorage] Saving config for plugin: ${pluginId}`);
    try {
      await prisma.pluginConfiguration.upsert({
        where: { pluginId: pluginId },
        update: {
          configJson: JSON.stringify(config)
        },
        create: {
          pluginId: pluginId,
          configJson: JSON.stringify(config)
        }
      });
    } catch (error) {
      console.error(`[DatabasePluginStorage] Error saving config for ${pluginId}:`, error);
      throw error;
    }
  }

  async removePluginConfig(pluginId: string): Promise<void> {
    console.log(`[DatabasePluginStorage] Removing config for plugin: ${pluginId}`);
    try {
      await prisma.pluginConfiguration.delete({
        where: { pluginId: pluginId }
      });
    } catch (error) {
      console.error(`[DatabasePluginStorage] Error removing config for ${pluginId}:`, error);
      if ((error as any)?.code === "P2025") {
        console.warn(`[DatabasePluginStorage] Config for ${pluginId} not found for removal.`);
        return; // Not an error if it's already gone
      }
      throw error;
    }
  }
}

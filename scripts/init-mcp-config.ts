// scripts/init-mcp-config.ts

import fs from "fs/promises";
import path from "path";

export const MCP_CONFIG_FILENAME = "mcp.json";

// Default configuration
export const DEFAULT_MCP_CONFIG = {
  mcpServers: []
};

// Get configuration directory path
export async function getConfigDirectory(): Promise<string> {
  const appData =
    process.env.APPDATA ||
    (process.platform === "darwin"
      ? path.join(process.env.HOME || "", "Library", "Application Support")
      : path.join(process.env.HOME || "", ".config"));

  const configDir = path.join(appData, "cadcamfun");

  try {
    await fs.mkdir(configDir, { recursive: true });
  } catch (error) {
    console.error("Failed to create config directory:", error);
  }

  return configDir;
}

// Get configuration file path
export async function getConfigFilePath(): Promise<string> {
  const configDir = await getConfigDirectory();
  return path.join(configDir, MCP_CONFIG_FILENAME);
}

// Ensure configuration file exists
export async function ensureConfigFile(): Promise<void> {
  const configPath = await getConfigFilePath();

  try {
    await fs.access(configPath);
  } catch {
    // File doesn't exist, create with defaults
    await fs.writeFile(configPath, JSON.stringify(DEFAULT_MCP_CONFIG, null, 2), "utf-8");
  }
}

async function initMCPConfig() {
  try {
    // Get config directory and ensure it exists
    const configDir = await getConfigDirectory();
    await fs.mkdir(configDir, { recursive: true });

    const configPath = await getConfigFilePath();

    // Check if config file already exists
    try {
      await fs.access(configPath);
      console.log(`MCP config file already exists at ${configPath}`);
      return;
    } catch {
      // File doesn't exist, create it from default template
      const defaultConfigPath = path.join(process.cwd(), "default-mcp.json");
      let defaultConfig;

      try {
        const defaultConfigContent = await fs.readFile(defaultConfigPath, "utf-8");
        defaultConfig = JSON.parse(defaultConfigContent);
      } catch (err) {
        console.error(`Error reading default config: ${err}`);
        defaultConfig = { mcpServers: [] };
      }

      await fs.writeFile(configPath, JSON.stringify(defaultConfig, null, 2), "utf-8");
      console.log(`Created MCP config file at ${configPath}`);
    }
  } catch (error) {
    console.error("Failed to initialize MCP config:", error);
    process.exit(1);
  }
}

initMCPConfig().catch(console.error);

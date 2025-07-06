// src/lib/mcp/config.ts
import path from "path";
import fs from "fs/promises";

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

  const configDir = path.join(appData, "your-app-name");

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

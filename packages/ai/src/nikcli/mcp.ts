import { Schema } from "effect"
import { AiMcpConfig } from "@cadcamfun/api"
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"

export type McpConfig = typeof AiMcpConfig.Type
export const mcpHostName = (name: string): string => `ext_mcp_${name}`
export const validateMcpName = (name: string): void => {
  if (name.length > 64 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) throw new Error("Use a server name of at most 64 lowercase letters, digits and hyphens")
}
export const validateMcpConfig = (value: unknown): McpConfig => {
  const config = Schema.decodeUnknownSync(AiMcpConfig)(value, { onExcessProperty: "error" })
  if (config.timeout !== undefined && (!Number.isSafeInteger(config.timeout) || config.timeout < 100 || config.timeout > 120_000)) throw new Error("MCP timeout must be between 100 and 120000 milliseconds")
  if (config.type === "local") {
    if (!config.command.length || config.command.length > 64 || config.command.some((arg) => !arg || arg.length > 4096 || arg.includes("\0"))) throw new Error("Provide a command and at most 63 non-empty arguments")
  } else {
    const url = new URL(config.url)
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("MCP requires an HTTP(S) URL without embedded credentials")
  }
  if (JSON.stringify(config).length > 32_000) throw new Error("MCP configuration exceeds 32 KB")
  return config
}

/** One atomic, owner-readable file per scratch project; a broken file never overwrites good configuration. */
export const mcpStore = (directory: string) => {
  const path = join(directory, "mcp-connections.json")
  const read = async (): Promise<Record<string, McpConfig>> => {
    let text: string
    try { text = await readFile(path, "utf8") } catch (cause) {
      if (cause && typeof cause === "object" && "code" in cause && cause.code === "ENOENT") return {}
      throw cause
    }
    const value: unknown = JSON.parse(text)
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid MCP configuration file")
    const entries: Record<string, McpConfig> = {}
    for (const [name, config] of Object.entries(value)) {
      validateMcpName(name)
      entries[name] = validateMcpConfig(config)
    }
    return entries
  }
  const write = async (entries: Readonly<Record<string, McpConfig>>): Promise<void> => {
    if (Object.keys(entries).length > 20) throw new Error("At most 20 MCP connections per project")
    await mkdir(directory, { recursive: true })
    const temp = `${path}.${crypto.randomUUID()}.tmp`
    try {
      await writeFile(temp, JSON.stringify(entries, null, 2), { mode: 0o600 })
      await rename(temp, path)
    } finally { await rm(temp, { force: true }) }
  }
  return { read, write }
}

export const MCP_CONFIG = {
  MAX_CONNECTIONS: 10,
  REQUEST_TIMEOUT: 8000, // Reduced from 15s to 8s
  RECONNECT_INTERVAL: 5000,
  CACHE_TTL: 3600
};

export type MCPEnvironment = "production" | "development";

export function getMCPEndpoints(env: MCPEnvironment) {
  return {
    baseUrl: env === "production" ? "https://cadcamfun.xyz/api/mcp" : "http://localhost:3000/api/mcp",
    authEndpoint: "/auth/v1",
    resourceEndpoint: "/resources/v2"
  };
}

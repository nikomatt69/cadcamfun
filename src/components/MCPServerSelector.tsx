// Server selector dropdown component
// src/components/MCPServerSelector.tsx
import { useMCP } from "../contexts/MCPContext";

type MCPServerSelectorProps = {
  value: string;
  onChange: (serverId: string) => void;
  onlyEnabled?: boolean;
  showType?: boolean;
};

export default function MCPServerSelector({
  value,
  onChange,
  onlyEnabled = true,
  showType = false
}: MCPServerSelectorProps) {
  const { servers, isLoading, error } = useMCP();

  // Ensure servers is an array before filtering
  const serversArray = Array.isArray(servers) ? servers : [];

  const filteredServers = onlyEnabled ? serversArray.filter(server => server.enabled) : serversArray;

  if (isLoading) {
    return <div className="text-gray-500">Loading servers...</div>;
  }

  if (error) {
    return <div className="text-red-500">Error loading servers: {error}</div>;
  }

  if (filteredServers.length === 0) {
    return <div className="text-gray-500">No MCP servers available</div>;
  }

  return (
    <select value={value} onChange={e => onChange(e.target.value)} className="block w-full p-2 border rounded">
      <option value="" disabled>
        Select MCP Server
      </option>
      {filteredServers.map(server => (
        <option key={server.id} value={server.id}>
          {server.name}
          {showType && <span className="text-gray-500">{` (${server.type === "sse" ? "SSE" : "stdio"})`}</span>}
        </option>
      ))}
    </select>
  );
}

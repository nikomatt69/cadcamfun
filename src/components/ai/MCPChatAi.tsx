import { useState } from "react";
import MCPResourceBrowser from "../../components/MCPResourceBrowser";
import MCPToolExplorer from "../../components/MCPToolExplorer";
import AIChatWithMCP from "@/src/components/AIChatWithMCP";
import Layout from "@/src/components/layout/Layout";
import MCPServerWithStatus from "@/src/components/MCPServerWithStatus";
export default function MCPChatAi() {
  const [activeTab, setActiveTab] = useState("resources");

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">MCP Examples</h1>
      <MCPServerWithStatus />
      <AIChatWithMCP />
      <div className="mb-4">
        <div className="flex border-b">
          <button
            className={`py-2 px-4 ${
              activeTab === "resources" ? "border-b-2 border-blue-500 font-medium" : "text-gray-500"
            }`}
            onClick={() => setActiveTab("resources")}
          >
            Resource Browser
          </button>
          <button
            className={`py-2 px-4 ${
              activeTab === "tools" ? "border-b-2 border-blue-500 font-medium" : "text-gray-500"
            }`}
            onClick={() => setActiveTab("tools")}
          >
            Tool Explorer
          </button>
        </div>
      </div>

      {activeTab === "resources" ? <MCPResourceBrowser /> : <MCPToolExplorer />}
    </div>
  );
}

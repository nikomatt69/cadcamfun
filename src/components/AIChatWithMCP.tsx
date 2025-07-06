// src/components/AIChatWithMCP.tsx
import { useState, useRef, useEffect } from "react";
import { useMCP } from "../contexts/MCPContext";
import MCPServerSelector from "./MCPServerSelector";
import { useContextStore } from "@/src/store/contextStore";

type Message = {
  role: "user" | "assistant" | "system";
  content: string;
};

export default function AIChatWithMCP() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedServerId, setSelectedServerId] = useState("");
  const [mcpReference, setMcpReference] = useState("");
  const [useMcpData, setUseMcpData] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { activeContextIds } = useContextStore();

  // Auto-scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!input.trim()) return;

    const userMessage: Message = {
      role: "user",
      content: input
    };

    setMessages([...messages, userMessage]);
    setInput("");
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          contextIds: activeContextIds,
          // Only include MCP data if requested
          ...(useMcpData && selectedServerId && mcpReference ? { mcpServerId: selectedServerId, mcpReference } : {})
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to get AI response");
      }

      const data = await response.json();

      const assistantMessage: Message = {
        role: "assistant",
        content: data.reply
      };

      setMessages(prevMessages => [...prevMessages, assistantMessage]);
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full max-h-screen">
      <div className="bg-gray-100 p-4 border-b">
        <h2 className="text-xl font-semibold mb-2">AI Chat with MCP Integration</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-gray-700 text-sm font-medium mb-1">MCP Server</label>
            <MCPServerSelector value={selectedServerId} onChange={setSelectedServerId} />
          </div>

          <div>
            <label className="block text-gray-700 text-sm font-medium mb-1">MCP Resource/Tool</label>
            <input
              type="text"
              value={mcpReference}
              onChange={e => setMcpReference(e.target.value)}
              placeholder="e.g., resource://users or create_user"
              className="w-full p-2 border truncate flex rounded"
              disabled={!selectedServerId}
            />
          </div>

          <div className="flex items-end">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={useMcpData}
                onChange={e => setUseMcpData(e.target.checked)}
                className="mr-2"
                disabled={!selectedServerId || !mcpReference}
              />
              <span className="text-gray-700 text-sm font-medium">Include MCP data in context</span>
            </label>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 dark:text-gray-400 my-8">
            Start a conversation by typing a message below.
          </div>
        ) : (
          messages.map((message, index) => (
            <div
              key={index}
              className={`p-4 rounded-lg max-w-3xl ${
                message.role === "user" ? "bg-blue-100 dark:bg-blue-900 ml-auto" : "bg-gray-100 dark:bg-gray-800"
              }`}
            >
              <div className="text-sm font-semibold mb-1">{message.role === "user" ? "You" : "AI Assistant"}</div>
              <div className="whitespace-pre-wrap">{message.content}</div>
            </div>
          ))
        )}

        {isLoading && (
          <div className="p-4 rounded-lg max-w-3xl bg-gray-100">
            <div className="text-sm font-semibold mb-1">AI Assistant</div>
            <div className="animate-pulse">Thinking...</div>
          </div>
        )}

        {error && <div className="p-4 rounded-lg max-w-3xl bg-red-100 text-red-700">Error: {error}</div>}

        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t">
        <form onSubmit={handleSubmit} className="flex space-x-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Type your message..."
            className="flex-1 p-2 border rounded"
            disabled={isLoading}
          />
          <button
            type="submit"
            className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
            disabled={isLoading || !input.trim()}
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}

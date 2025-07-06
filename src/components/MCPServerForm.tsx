// src/components/MCPServerForm.tsx
import { useState, useEffect } from "react";
import { MCPServerConfig } from "../lib/mcp/client";

type MCPServerFormProps = {
  initialValues?: Partial<MCPServerConfig>;
  onSubmit: (values: Omit<MCPServerConfig, "id">) => Promise<void>;
  onCancel?: () => void;
  isSubmitting?: boolean;
};

export default function MCPServerForm({
  initialValues = {},
  onSubmit,
  onCancel,
  isSubmitting = false
}: MCPServerFormProps) {
  const [name, setName] = useState(initialValues.name || "");
  const [type, setType] = useState<"sse" | "stdio">((initialValues.type as any) || "sse");
  const [url, setUrl] = useState(initialValues.id || "");
  const [command, setCommand] = useState((initialValues as any)?.command || "");
  const [argsText, setArgsText] = useState("");
  const [workingDirectory, setWorkingDirectory] = useState((initialValues as any)?.workingDirectory || "");
  const [defaultWorkingDirectory, setDefaultWorkingDirectory] = useState(
    (initialValues as any)?.defaultWorkingDirectory || ""
  );
  const [enabled, setEnabled] = useState(initialValues.enabled !== false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Parse args from initial values if they exist
  useEffect(() => {
    if ((initialValues as any)?.args) {
      try {
        // If args is a JSON string array, convert to string for editing
        const args = (initialValues as any).args;
        if (Array.isArray(args)) {
          setArgsText(args.join(" "));
        } else {
          setArgsText(JSON.stringify(args));
        }
      } catch (e) {
        console.error("Failed to parse args:", e);
        setArgsText("");
      }
    }
  }, [initialValues]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!name.trim()) {
      newErrors.name = "Name is required";
    }

    if (type === "sse" && !url.trim()) {
      newErrors.url = "URL is required for SSE servers";
    }

    if (type === "stdio" && !command.trim()) {
      newErrors.command = "Command is required for stdio servers";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) {
      return;
    }

    // Parse args from space-separated string to array
    let parsedArgs: string[] = [];
    if (argsText.trim()) {
      try {
        // First try to parse as JSON
        parsedArgs = JSON.parse(argsText);
      } catch {
        // If not valid JSON, treat as space-separated args
        parsedArgs = argsText.split(/\s+/).filter(Boolean);
      }
    }

    const values: Omit<MCPServerConfig, "id"> = {
      name,
      type,
      enabled,
      ...(type === "sse" ? { url } : {}),
      ...(type === "stdio"
        ? {
            command,
            args: parsedArgs,
            workingDirectory: workingDirectory || undefined,
            defaultWorkingDirectory: defaultWorkingDirectory || undefined
          }
        : {})
    } as any;

    await onSubmit(values);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Server Name</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          className={`w-full p-2 border rounded ${errors.name ? "border-red-500" : "border-gray-300"}`}
          placeholder="My MCP Server"
          disabled={isSubmitting}
        />
        {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name}</p>}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Server Type</label>
        <select
          value={type}
          onChange={e => setType(e.target.value as "sse" | "stdio")}
          className="w-full p-2 border border-gray-300 rounded"
          disabled={isSubmitting || (initialValues.id ? true : false)} // Disable type change for existing servers
        >
          <option value="sse">Server-Sent Events (SSE)</option>
          <option value="stdio">Standard I/O (stdio)</option>
        </select>
      </div>

      {type === "sse" && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Server URL</label>
          <input
            type="text"
            value={url}
            onChange={e => setUrl(e.target.value)}
            className={`w-full p-2 border rounded ${errors.url ? "border-red-500" : "border-gray-300"}`}
            placeholder="https://example.com/mcp"
            disabled={isSubmitting}
          />
          {errors.url && <p className="mt-1 text-sm text-red-600">{errors.url}</p>}
        </div>
      )}

      {type === "stdio" && (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Command</label>
            <input
              type="text"
              value={command}
              onChange={e => setCommand(e.target.value)}
              className={`w-full p-2 border rounded ${errors.command ? "border-red-500" : "border-gray-300"}`}
              placeholder="node mcp-server.js"
              disabled={isSubmitting}
            />
            {errors.command && <p className="mt-1 text-sm text-red-600">{errors.command}</p>}
            <p className="mt-1 text-xs text-gray-500">
              The command to run the MCP server (e.g., &quot;node server.js&quot;)
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Arguments</label>
            <input
              type="text"
              value={argsText}
              onChange={e => setArgsText(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded"
              placeholder="--port 8080 --config config.json"
              disabled={isSubmitting}
            />
            <p className="mt-1 text-xs text-gray-500">Space-separated arguments to pass to the command</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Working Directory</label>
            <input
              type="text"
              value={workingDirectory}
              onChange={e => setWorkingDirectory(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded"
              placeholder="/path/to/working/directory"
              disabled={isSubmitting}
            />
            <p className="mt-1 text-xs text-gray-500">Optional: The directory where the command should be executed</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Default Working Directory</label>
            <input
              type="text"
              value={defaultWorkingDirectory}
              onChange={e => setDefaultWorkingDirectory(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded"
              placeholder="/path/to/default/directory"
              disabled={isSubmitting}
            />
            <p className="mt-1 text-xs text-gray-500">Optional: The default directory for projects using this server</p>
          </div>
        </>
      )}

      <div className="flex items-center">
        <input
          type="checkbox"
          id="enabled"
          checked={enabled}
          onChange={e => setEnabled(e.target.checked)}
          className="h-4 w-4 text-blue-600 border-gray-300 rounded"
          disabled={isSubmitting}
        />
        <label htmlFor="enabled" className="ml-2 block text-sm text-gray-700">
          Enabled
        </label>
      </div>

      <div className="flex space-x-3 pt-2">
        <button
          type="submit"
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Saving..." : initialValues.id ? "Update Server" : "Add Server"}
        </button>

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded"
            disabled={isSubmitting}
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

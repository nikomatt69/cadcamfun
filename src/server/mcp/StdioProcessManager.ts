// Process manager for stdio-based MCP servers
import { spawn, ChildProcess } from "child_process";
import { MCPStdioServerConfig } from "@/src/lib/mcp/client";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import fs from "fs/promises";
import { EventEmitter } from "events";

interface ManagedProcess {
  id: string;
  process: ChildProcess;
  config: MCPStdioServerConfig;
  ready: boolean;
  lastError?: string;
  lastActivity: Date;
  onData?: (data: Buffer) => void;
  onError?: (error: Error) => void;
  // Store any pending request callbacks
  pendingRequests: Map<
    string,
    {
      resolve: (value: any) => void;
      reject: (error: Error) => void;
      timeout: NodeJS.Timeout;
    }
  >;
}

interface StdioRequest {
  id: string;
  type: "getCapabilities" | "readResource" | "callTool";
  resource?: string;
  tool?: string;
  parameters?: any;
}

export class StdioProcessManager extends EventEmitter {
  private processes: Map<string, ManagedProcess> = new Map();
  private requestTimeout: number = 60000; // 30 seconds timeout for requests

  constructor() {
    super();
    // Set up periodic cleanup of inactive processes
    setInterval(() => this.cleanupInactiveProcesses(), 5 * 60 * 1000); // Every 5 minutes
  }

  private cleanupInactiveProcesses() {
    const now = new Date();
    for (const [serverId, managedProcess] of Array.from(this.processes.entries())) {
      // If last activity was more than 30 minutes ago, terminate the process
      const inactiveTime = now.getTime() - managedProcess.lastActivity.getTime();
      if (inactiveTime > 30 * 60 * 1000) {
        console.log(`Terminating inactive stdio server process: ${serverId}`);
        this.terminateProcess(serverId);
      }
    }
  }

  private terminateProcess(serverId: string) {
    const managedProcess = this.processes.get(serverId);
    if (managedProcess) {
      try {
        // Reject any pending requests
        for (const [requestId, request] of Array.from(managedProcess.pendingRequests.entries())) {
          clearTimeout(request.timeout);
          request.reject(new Error("Process terminated"));
        }

        // Kill the process
        managedProcess.process.kill();
      } catch (error) {
        console.error(`Error terminating process for server ${serverId}:`, error);
      }

      this.processes.delete(serverId);
      this.emit("process:terminated", { serverId });
    }
  }

  private extractJsonFromOutput(output: string): any {
    try {
      // Find JSON object in the output - look for text between { and }
      const jsonMatch = output.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return null;
    } catch (error) {
      console.error("Error extracting JSON from output:", error);
      return null;
    }
  }

  async startProcess(config: MCPStdioServerConfig): Promise<boolean> {
    try {
      // Check if process is already running
      if (this.processes.has(config.id)) {
        // If already running, just update the config in case it changed
        const existingProcess = this.processes.get(config.id)!;
        existingProcess.config = config;
        existingProcess.lastActivity = new Date();
        return true;
      }

      // Prepare working directory
      const workingDir = config.workingDirectory || process.cwd();

      // Make sure the working directory exists
      try {
        await fs.access(workingDir);
      } catch (error) {
        console.error(`Working directory does not exist: ${workingDir}`);
        return false;
      }

      // Prepare command and arguments
      const command = config.command;
      const args = config.args || [];

      console.log(`Starting stdio server process: ${command} ${args.join(" ")}`);
      console.log(`Working directory: ${workingDir}`);

      // Spawn the process
      const childProcess = spawn(command, args, {
        cwd: workingDir,
        stdio: ["pipe", "pipe", "pipe"], // stdin, stdout, stderr
        env: { ...process.env, MCP_SERVER_ID: config.id },
        shell: true // Use shell to ensure path resolution works correctly
      });

      // Create a managed process object
      const managedProcess: ManagedProcess = {
        id: config.id,
        process: childProcess,
        config,
        ready: false,
        lastActivity: new Date(),
        pendingRequests: new Map()
      };

      // Set up event handlers
      childProcess.on("error", error => {
        console.error(`Process error for server ${config.id}:`, error);
        managedProcess.lastError = error.message;

        // Reject all pending requests
        for (const [requestId, request] of Array.from(managedProcess.pendingRequests.entries())) {
          clearTimeout(request.timeout);
          request.reject(error);
          managedProcess.pendingRequests.delete(requestId);
        }

        this.emit("process:error", {
          serverId: config.id,
          error
        });
      });

      childProcess.on("exit", (code, signal) => {
        console.log(`Process for server ${config.id} exited with code ${code} and signal ${signal}`);

        // Reject all pending requests
        for (const [requestId, request] of Array.from(managedProcess.pendingRequests.entries())) {
          clearTimeout(request.timeout);
          request.reject(new Error(`Process exited with code ${code}`));
          managedProcess.pendingRequests.delete(requestId);
        }

        this.processes.delete(config.id);
        this.emit("process:exit", {
          serverId: config.id,
          code,
          signal
        });
      });

      // Buffer for collecting stdout data
      let stdoutBuffer = "";
      let stderrBuffer = "";

      childProcess.stdout.on("data", data => {
        const dataStr = data.toString();
        console.log(`[STDOUT ${config.id}] ${dataStr}`);
        stdoutBuffer += dataStr;

        // Process any complete JSON responses
        try {
          // Process each line separately (in case multiple JSON objects are received)
          const lines = stdoutBuffer.split("\n");
          const incompleteLines = [];

          for (const line of lines) {
            if (!line.trim()) continue;

            try {
              // Try parsing the line as JSON directly
              const jsonData = JSON.parse(line);
              console.log(`Parsed JSON: ${JSON.stringify(jsonData)}`);

              if (jsonData.requestId) {
                const pendingRequest = managedProcess.pendingRequests.get(jsonData.requestId);

                if (pendingRequest) {
                  clearTimeout(pendingRequest.timeout);

                  if (jsonData.status === "error") {
                    pendingRequest.reject(new Error(jsonData.error || "Unknown error"));
                  } else {
                    pendingRequest.resolve(jsonData.result || jsonData);
                  }

                  managedProcess.pendingRequests.delete(jsonData.requestId);
                }
              }
            } catch (jsonError) {
              // Not a valid JSON line, keep it for later processing
              incompleteLines.push(line);
            }
          }

          // Keep any incomplete lines for the next data chunk
          stdoutBuffer = incompleteLines.join("\n");

          // If there are remaining incomplete lines, try to extract JSON from them
          if (stdoutBuffer.includes("{") && stdoutBuffer.includes("}")) {
            const jsonData = this.extractJsonFromOutput(stdoutBuffer);
            if (jsonData && jsonData.requestId) {
              const requestId = jsonData.requestId;
              const pendingRequest = managedProcess.pendingRequests.get(requestId);

              if (pendingRequest) {
                clearTimeout(pendingRequest.timeout);

                if (jsonData.status === "error") {
                  pendingRequest.reject(new Error(jsonData.error || "Unknown error"));
                } else {
                  pendingRequest.resolve(jsonData.result || jsonData);
                }

                managedProcess.pendingRequests.delete(requestId);

                // Clear the processed JSON from the buffer
                stdoutBuffer = "";
              }
            }
          }
        } catch (error) {
          console.error(`Error processing stdout for server ${config.id}:`, error);
        }

        // Update last activity time
        managedProcess.lastActivity = new Date();
      });

      childProcess.stderr.on("data", data => {
        const dataStr = data.toString();
        stderrBuffer += dataStr;
        console.error(`[STDERR ${config.id}] ${dataStr}`);

        // Update last activity time
        managedProcess.lastActivity = new Date();
      });

      // Store the managed process
      this.processes.set(config.id, managedProcess);

      // Wait for the process to be ready
      return new Promise<boolean>(resolve => {
        // Set a timeout to check if the process is running
        setTimeout(() => {
          if (childProcess.killed) {
            console.error(`Process for server ${config.id} was killed during startup`);
            resolve(false);
          } else {
            managedProcess.ready = true;
            this.emit("process:ready", { serverId: config.id });
            console.log(`Process for server ${config.id} is ready`);
            resolve(true);
          }
        }, 2000); // Wait 2 seconds for process to be ready
      });
    } catch (error) {
      console.error(`Error starting process for server ${config.id}:`, error);
      return false;
    }
  }

  isProcessRunning(serverId: string): boolean {
    const managedProcess = this.processes.get(serverId);
    return !!managedProcess && managedProcess.ready && !managedProcess.process.killed;
  }

  private async sendRequest(serverId: string, request: StdioRequest): Promise<any> {
    const managedProcess = this.processes.get(serverId);
    if (!managedProcess) {
      throw new Error(`Process for server ${serverId} not found`);
    }

    if (!managedProcess.ready || managedProcess.process.killed) {
      throw new Error(`Process for server ${serverId} is not ready or has been killed`);
    }

    // Update last activity time
    managedProcess.lastActivity = new Date();

    return new Promise((resolve, reject) => {
      // Create a timeout for the request
      const timeout = setTimeout(() => {
        managedProcess.pendingRequests.delete(request.id);
        reject(new Error(`Request timed out after ${this.requestTimeout}ms`));
      }, this.requestTimeout);

      // Store the request callbacks
      managedProcess.pendingRequests.set(request.id, {
        resolve,
        reject,
        timeout
      });

      // Send the request to the process
      const requestJson = JSON.stringify(request);
      console.log(`Sending request to process ${serverId}:`, requestJson);
      try {
        if (!managedProcess.process.stdin) {
          throw new Error(`stdin is not available for process ${serverId}`);
        }
        const success = managedProcess.process.stdin.write(requestJson + "\n");
        if (!success) {
          // Handle backpressure if write returns false
          managedProcess.process.stdin.once("drain", () => {
            console.log(`Drain event triggered for ${serverId}`);
          });
        }
      } catch (error) {
        console.error(`Error writing to process stdin for ${serverId}:`, error);
        managedProcess.pendingRequests.delete(request.id);
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  async getServerCapabilities(serverId: string): Promise<any> {
    const request: StdioRequest = {
      id: uuidv4(),
      type: "getCapabilities"
    };

    try {
      console.log(`Getting capabilities for server ${serverId}`);

      // First check if the process is running
      if (!this.isProcessRunning(serverId)) {
        console.error(`Process for server ${serverId} is not running`);
        throw new Error(`Process for server ${serverId} is not running`);
      }

      const result = await this.sendRequest(serverId, request);
      console.log(`Got capabilities for server ${serverId}:`, result);
      return result;
    } catch (error: any) {
      console.error(`Error getting capabilities for server ${serverId}:`, error);

      // Get the managed process to access its config
      const managedProcess = this.processes.get(serverId);
      if (!managedProcess) {
        throw new Error(`Process manager has no record of server ${serverId}`);
      }

      // Provide a default capabilities object on error
      return {
        name: managedProcess.config.name,
        version: "1.0.0",
        instructions: `stdio server capabilities could not be retrieved: ${error.message}`,
        resources: [
          {
            name: "Status",
            description: "Server status information",
            uriTemplate: "resource://status"
          }
        ],
        tools: [
          {
            name: "echo",
            description: "Echo the input back to the output",
            parameters: {
              type: "object",
              properties: {
                text: {
                  type: "string",
                  description: "Text to echo"
                }
              },
              required: ["text"]
            }
          }
        ]
      };
    }
  }

  async readResource(serverId: string, resourceUri: string): Promise<any> {
    const request: StdioRequest = {
      id: uuidv4(),
      type: "readResource",
      resource: resourceUri
    };

    return this.sendRequest(serverId, request);
  }

  async callTool(serverId: string, toolName: string, parameters: any): Promise<any> {
    const request: StdioRequest = {
      id: uuidv4(),
      type: "callTool",
      tool: toolName,
      parameters
    };

    return this.sendRequest(serverId, request);
  }

  async stopProcess(serverId: string): Promise<boolean> {
    const managedProcess = this.processes.get(serverId);
    if (!managedProcess) {
      return false;
    }

    try {
      this.terminateProcess(serverId);
      return true;
    } catch (error) {
      console.error(`Error stopping process for server ${serverId}:`, error);
      return false;
    }
  }

  async stopAllProcesses(): Promise<void> {
    for (const serverId of Array.from(this.processes.keys())) {
      await this.stopProcess(serverId);
    }
  }
}

// Create a singleton instance
export const stdioProcessManager = new StdioProcessManager();

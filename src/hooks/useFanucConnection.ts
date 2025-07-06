import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { FanucStatus, FanucPosition, Machine, CncProgram, ToolOffsets, WorkOffset } from "src/types/fanuc"; // Import shared types

// Tipos para los datos de la máquina CNC
// Remove local definitions - now imported
// export interface FanucPosition { ... }
// export interface FanucStatus { ... }
// export interface Machine { ... }

interface WebSocketMessage {
  type: string;
  id?: string;
  success?: boolean;
  data?: any;
  message?: string;
}

let messageId = 1;

// Define the shape of the object returned by the hook
interface FanucConnectionHook {
  isConnecting: boolean;
  isConnected: boolean;
  error: string | null;
  availableMachines: Machine[];
  selectedMachine: Machine | null;
  machineStatus: FanucStatus | null;
  connectToServer: () => void;
  connectToMachine: (machineId: string) => Promise<void>;
  connectToManualIp: (ip: string, port: number) => Promise<void>; // Added new function type
  disconnectFromMachine: () => Promise<void>;
  getMachineStatus: () => Promise<FanucStatus>;
  setMode: (mode: FanucStatus["mode"]) => Promise<any>;
  homeMachine: (axes?: ("X" | "Y" | "Z" | "A" | "B" | "C")[]) => Promise<any>;
  jogAxis: (axis: "X" | "Y" | "Z" | "A" | "B" | "C", distance: number, feedRate?: number) => Promise<any>;
  runProgram: (programNumber: number) => Promise<any>;
  holdProgram: () => Promise<any>;
  resumeProgram: () => Promise<any>;
  stopProgram: () => Promise<any>;
  setFeedOverride: (percent: number) => Promise<any>;
  setSpindleOverride: (percent: number) => Promise<any>;
  setSpindleSpeed: (rpm: number) => Promise<any>;
  sendMdiCommand: (mdiCommand: string) => Promise<any>;
  uploadProgram: (programNumber: number, programContent: string) => Promise<any>;
  downloadProgram: (programNumber: number) => Promise<string>;
  listPrograms: () => Promise<CncProgram[]>;
  deleteProgram: (programNumber: number) => Promise<any>;
  setToolOffset: (toolNumber: number, offsetType: number, value: number) => Promise<any>;
  getToolOffsets: (toolNumber: number) => Promise<ToolOffsets>;
  setWorkOffset: (offsetNumber: number, axis: string, value: number) => Promise<any>;
  getWorkOffsets: () => Promise<WorkOffset[]>;
  resetAlarms: () => Promise<any>;
  convertToFanucFormat: (gcode: string, programNumber?: number) => string; // Added helper
}

/**
 * Hook para gestionar la conexión con un controlador CNC Fanuc via WebSocket server
 */
export function useFanucConnection(serverUrl: string = "ws://localhost:3001"): FanucConnectionHook {
  // Default to port 3001 based on server.js
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [machineStatus, setMachineStatus] = useState<FanucStatus | null>(null);
  const [availableMachines, setAvailableMachines] = useState<Machine[]>([]);
  const [selectedMachine, setSelectedMachine] = useState<Machine | null>(null);
  const [error, setError] = useState<string | null>(null);

  // WebSocket connection reference
  const wsRef = useRef<WebSocket | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Callbacks waiting for responses
  const pendingCallbacks = useRef<Map<string, { resolve: Function; reject: Function; timeout: NodeJS.Timeout }>>(
    new Map()
  );

  // Function to clear all timeouts/intervals
  const cleanup = useCallback(() => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    // Reject pending callbacks on cleanup
    pendingCallbacks.current.forEach(({ reject, timeout }) => {
      clearTimeout(timeout);
      reject(new Error("Connection closed"));
    });
    pendingCallbacks.current.clear();

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.close();
    }
    wsRef.current = null;
    setIsConnected(false);
    setIsConnecting(false);
    setSelectedMachine(null);
    setMachineStatus(null);
  }, []);

  // Send a command to the server
  const sendCommand = useCallback((command: string, params: any = {}): Promise<any> => {
    return new Promise((resolve, reject) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        // setError('Not connected to the machine control server.'); // Optionally set error state
        reject(new Error("Not connected to server"));
        return;
      }

      const id = `cmd_${messageId++}`;
      const message = {
        command,
        id,
        ...params
      };

      // Set up timeout to reject the promise if no response is received
      const timeout = setTimeout(() => {
        if (pendingCallbacks.current.has(id)) {
          pendingCallbacks.current.delete(id);
          console.error(`Command timed out: ${command}`, params);
          reject(new Error(`Command timed out: ${command}`));
        }
      }, 15000); // 15 second timeout

      // Store callback to be called when response is received
      pendingCallbacks.current.set(id, { resolve, reject, timeout });

      // Send the message
      try {
        wsRef.current.send(JSON.stringify(message));
      } catch (sendError) {
        clearTimeout(timeout);
        pendingCallbacks.current.delete(id);
        console.error("WebSocket send error:", sendError);
        reject(new Error("Failed to send command to server."));
      }
    });
  }, []); // No dependencies needed as it uses refs

  // Handle incoming messages
  const handleMessage = useCallback((message: WebSocketMessage) => {
    // console.log("WS Message Rcvd:", message); // For debugging
    switch (message.type) {
      case "init":
        // Initial data from server
        if (message.data?.machines) {
          setAvailableMachines(message.data.machines);
        }
        break;

      case "status":
        // Machine status update
        setMachineStatus(message.data);
        setError(null); // Clear previous errors on good status
        break;

      case "connection":
        // Connection status update (to a specific CNC)
        setIsConnecting(false);
        if (message.success) {
          setIsConnected(true);
          setSelectedMachine(message.data?.machine);
          setError(null);
          console.log("Connected to machine:", message.data?.machine?.name);
        } else {
          setIsConnected(false);
          setSelectedMachine(null);
          setError(message.message || "Connection to machine failed");
          console.error("Machine connection failed:", message.message);
        }
        break;

      case "error":
        // General error message from server/FOCAS
        setError(message.message || "Unknown server error");
        console.error("Server/FOCAS Error:", message.message);
        break;

      case "response":
        // Response to a specific command
        if (message.id && pendingCallbacks.current.has(message.id)) {
          const { resolve, reject, timeout } = pendingCallbacks.current.get(message.id)!;
          clearTimeout(timeout);

          if (message.success) {
            resolve(message.data);
          } else {
            const errMsg = message.message || "Command failed on server";
            console.error(`Command Response Error (ID: ${message.id}):`, errMsg);
            setError(errMsg);
            reject(new Error(errMsg));
          }

          pendingCallbacks.current.delete(message.id);
        }
        break;
    }
  }, []); // Empty dependency array, uses refs

  // Connect to WebSocket server
  const connectToServer = useCallback(() => {
    if (wsRef.current) return; // Already connected or connecting

    console.log("Attempting to connect to WebSocket server:", serverUrl);
    setError(null);

    try {
      const ws = new WebSocket(serverUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("WebSocket connection to server opened");
        setError(null);
        // Clear any reconnect timeout
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }

        // Request initial machine list
        sendCommand("getMachines").catch(err => {
          console.error("Failed to get initial machine list:", err);
          setError("Failed to get machine list from server.");
        });

        // Send ping to keep connection alive
        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            sendCommand("ping").catch(err => {
              console.warn("Server ping failed:", err);
              // Consider triggering reconnect or closing if pings fail consistently
            });
          }
        }, 30000);
      };

      ws.onclose = event => {
        console.log(`WebSocket connection closed. Code: ${event.code}, Reason: ${event.reason}`);
        // Clear intervals/timeouts associated with the open connection
        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
        wsRef.current = null;
        setIsConnected(false);
        setIsConnecting(false);
        setSelectedMachine(null);
        setMachineStatus(null);

        // Reject pending calls
        pendingCallbacks.current.forEach(({ reject, timeout }) => {
          clearTimeout(timeout);
          reject(new Error("WebSocket connection closed"));
        });
        pendingCallbacks.current.clear();

        // Attempt to reconnect after a delay, unless closed cleanly
        if (event.code !== 1000 && event.code !== 1005) {
          // Don't auto-reconnect on normal closure
          console.log("Attempting WebSocket reconnect in 5 seconds...");
          if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = setTimeout(connectToServer, 5000);
        }
      };

      ws.onerror = error => {
        console.error("WebSocket error:", error);
        setError("WebSocket connection error");
        // The onclose event will likely fire after this, triggering reconnect logic
      };

      ws.onmessage = event => {
        try {
          handleMessage(JSON.parse(event.data as string));
        } catch (parseError) {
          console.error("Failed to parse WebSocket message:", parseError, "Data:", event.data);
          setError("Received invalid message from server.");
        }
      };
    } catch (err) {
      console.error("Failed to create WebSocket connection:", err);
      setError("Failed to connect to server");
    }
  }, [serverUrl, sendCommand, handleMessage]);

  // Initial connection attempt on mount
  useEffect(() => {
    connectToServer();
    // Cleanup on unmount
    return () => {
      console.log("Cleaning up Fanuc connection hook...");
      cleanup();
    };
  }, [connectToServer, cleanup]);

  // Connect to a specific machine by ID
  const connectToMachine = useCallback(
    async (machineId: string): Promise<void> => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        setError("WebSocket server not connected. Cannot connect to machine.");
        throw new Error("Server not connected");
      }
      setIsConnecting(true);
      setError(null);
      try {
        await sendCommand("connect", { machineId });
        // The response handler will update isConnecting, isConnected, selectedMachine, and error
        console.log(`Connection request sent for machine ID: ${machineId}`);
      } catch (err) {
        console.error(`Error initiating connection to machine ${machineId}:`, err);
        setError(`Failed to initiate connection: ${err instanceof Error ? err.message : "Unknown error"}`);
        setIsConnecting(false);
        throw err; // Re-throw for the caller
      }
    },
    [sendCommand]
  );

  // Connect to a specific machine by manual IP/Port
  const connectToManualIp = useCallback(
    async (ip: string, port: number): Promise<void> => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        setError("WebSocket server not connected. Cannot connect to machine.");
        throw new Error("Server not connected");
      }
      setIsConnecting(true);
      setError(null);
      console.log(`Attempting manual connection to ${ip}:${port}`);
      try {
        // We need a new command for the server to handle this
        await sendCommand("connectManual", { ip, port });
        // The response handler will update isConnecting, isConnected, selectedMachine, and error
        console.log(`Manual connection request sent for ${ip}:${port}`);
      } catch (err) {
        console.error(`Error initiating manual connection to ${ip}:${port}:`, err);
        setError(`Failed to initiate manual connection: ${err instanceof Error ? err.message : "Unknown error"}`);
        setIsConnecting(false);
        throw err; // Re-throw for the caller
      }
    },
    [sendCommand]
  );

  // Disconnect from the current machine
  const disconnectFromMachine = useCallback(async () => {
    if (!selectedMachine) return; // Already disconnected
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setError("Not connected to server. Cannot disconnect machine.");
      return Promise.reject(new Error("Not connected to server"));
    }
    try {
      await sendCommand("disconnect");
      // State updates happen in handleMessage or onclose if server disconnects us
      setIsConnected(false);
      setSelectedMachine(null);
      setMachineStatus(null);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(errorMsg);
      console.error("Error sending disconnect command:", errorMsg);
      // Even if command fails, update state locally
      setIsConnected(false);
      setSelectedMachine(null);
      setMachineStatus(null);
      // throw err;
    }
  }, [sendCommand, selectedMachine]);

  // --- CNC Control Functions ---
  // Note: These just send commands. Success/failure and status updates are handled by the WebSocket message handler.

  const setMode = useCallback((mode: FanucStatus["mode"]) => sendCommand("setMode", { mode }), [sendCommand]);
  const homeMachine = useCallback(
    (axes?: ("X" | "Y" | "Z" | "A" | "B" | "C")[]) => sendCommand("home", { axes }),
    [sendCommand]
  );
  const jogAxis = useCallback(
    (axis: "X" | "Y" | "Z" | "A" | "B" | "C", distance: number, feedRate?: number) =>
      sendCommand("jog", { axis, distance, feedRate }),
    [sendCommand]
  );
  const runProgram = useCallback(
    (programNumber: number) => sendCommand("runProgram", { programNumber }),
    [sendCommand]
  );
  const holdProgram = useCallback(() => sendCommand("holdProgram"), [sendCommand]);
  const resumeProgram = useCallback(() => sendCommand("resumeProgram"), [sendCommand]);
  const stopProgram = useCallback(() => sendCommand("stopProgram"), [sendCommand]);
  const setFeedOverride = useCallback((percent: number) => sendCommand("setFeedOverride", { percent }), [sendCommand]);
  const setSpindleOverride = useCallback(
    (percent: number) => sendCommand("setSpindleOverride", { percent }),
    [sendCommand]
  );
  const setSpindleSpeed = useCallback((rpm: number) => sendCommand("setSpindleSpeed", { rpm }), [sendCommand]);
  const sendMdiCommand = useCallback((mdiCommand: string) => sendCommand("sendMdi", { mdiCommand }), [sendCommand]);
  const uploadProgram = useCallback(
    (programNumber: number, programContent: string) => sendCommand("uploadProgram", { programNumber, programContent }),
    [sendCommand]
  );
  const downloadProgram = useCallback(
    (programNumber: number): Promise<string> => sendCommand("downloadProgram", { programNumber }),
    [sendCommand]
  );
  const listPrograms = useCallback((): Promise<CncProgram[]> => sendCommand("listPrograms"), [sendCommand]);
  const deleteProgram = useCallback(
    (programNumber: number) => sendCommand("deleteProgram", { programNumber }),
    [sendCommand]
  );
  const setToolOffset = useCallback(
    (toolNumber: number, offsetType: number, value: number) =>
      sendCommand("setToolOffset", { toolNumber, offsetType, value }),
    [sendCommand]
  );
  const getToolOffsets = useCallback(
    (toolNumber: number): Promise<ToolOffsets> => sendCommand("getToolOffsets", { toolNumber }),
    [sendCommand]
  );
  const setWorkOffset = useCallback(
    (offsetNumber: number, axis: string, value: number) => sendCommand("setWorkOffset", { offsetNumber, axis, value }),
    [sendCommand]
  );
  const getWorkOffsets = useCallback((): Promise<WorkOffset[]> => sendCommand("getWorkOffsets"), [sendCommand]);
  const resetAlarms = useCallback(() => sendCommand("resetAlarms"), [sendCommand]);

  // Convert standard G-code to Fanuc format (simple version)
  const convertToFanucFormat = useCallback((gcode: string, programNumber: number = 1000): string => {
    const lines = gcode.trim().split("\n");
    const fanucProgram: string[] = [];

    // Add program header
    fanucProgram.push(`%`);
    fanucProgram.push(`O${String(programNumber).padStart(4, "0")}`); // Ensure 4 digits

    // Process each line
    lines.forEach((line, index) => {
      // Remove comments (parentheses and semicolon)
      let cleanLine = line
        .replace(/\(.*?\)/g, "")
        .replace(/;.*$/, "")
        .trim()
        .toUpperCase();

      if (!cleanLine) return;

      // Add sequence number (N) for each line if not already present
      if (!cleanLine.match(/^N\d+/)) {
        cleanLine = `N${(index + 1) * 10} ${cleanLine}`;
      }

      // Fanuc-specific formatting (minimal example)
      // Ensure space after G/M codes followed by digits
      cleanLine = cleanLine.replace(/([GM])(\d+)/g, "$1 $2");

      // Convert G92 to G10 L2 Px for modern Fanuc controls (complex, depends on context)
      // This is a basic example, real conversion might be needed
      // if (cleanLine.includes('G92 ') && !cleanLine.includes('E')) {
      //    cleanLine = cleanLine.replace('G92', 'G10 L2 P1'); // Assuming WCS 1
      // }

      fanucProgram.push(cleanLine);
    });

    // Ensure program ends with M30
    if (!fanucProgram.some(line => line.includes("M30"))) {
      const lastN =
        fanucProgram.length > 0 ? parseInt(fanucProgram[fanucProgram.length - 1].match(/^N(\d+)/)?.[1] || "0") : 0;
      fanucProgram.push(`N${lastN + 10} M30`);
    }

    // Add program end
    fanucProgram.push(`%`);

    return fanucProgram.join("\n");
  }, []);

  // Return the hook's public API
  return useMemo(() => {
    // Commands
    const getMachineStatus = () => sendCommand("getStatus");
    const setMode = (mode: FanucStatus["mode"]) => sendCommand("setMode", { mode });
    const homeMachine = (axes?: ("X" | "Y" | "Z" | "A" | "B" | "C")[]) => sendCommand("home", { axes });
    const jogAxis = (axis: "X" | "Y" | "Z" | "A" | "B" | "C", distance: number, feedRate?: number) =>
      sendCommand("jog", { axis, distance, feedRate });
    const runProgram = (programNumber: number) => sendCommand("runProgram", { programNumber });
    const holdProgram = () => sendCommand("holdProgram");
    const resumeProgram = () => sendCommand("resumeProgram");
    const stopProgram = () => sendCommand("stopProgram");
    const setFeedOverride = (percent: number) => sendCommand("setFeedOverride", { percent });
    const setSpindleOverride = (percent: number) => sendCommand("setSpindleOverride", { percent });
    const setSpindleSpeed = (rpm: number) => sendCommand("setSpindleSpeed", { rpm });
    const sendMdiCommand = (mdiCommand: string) => sendCommand("sendMdi", { mdiCommand });
    const uploadProgram = (programNumber: number, programContent: string) =>
      sendCommand("uploadProgram", { programNumber, programContent });
    const downloadProgram = (programNumber: number) => sendCommand("downloadProgram", { programNumber });
    const listPrograms = () => sendCommand("listPrograms");
    const deleteProgram = (programNumber: number) => sendCommand("deleteProgram", { programNumber });
    const setToolOffset = (toolNumber: number, offsetType: number, value: number) =>
      sendCommand("setToolOffset", { toolNumber, offsetType, value });
    const getToolOffsets = (toolNumber: number) => sendCommand("getToolOffsets", { toolNumber });
    const setWorkOffset = (offsetNumber: number, axis: string, value: number) =>
      sendCommand("setWorkOffset", { offsetNumber, axis, value });
    const getWorkOffsets = () => sendCommand("getWorkOffsets");
    const resetAlarms = () => sendCommand("resetAlarms");

    return {
      // State
      isConnecting,
      isConnected,
      error,
      availableMachines,
      selectedMachine,
      machineStatus,
      // Connection functions
      connectToServer,
      connectToMachine,
      connectToManualIp,
      disconnectFromMachine,
      // Commands
      getMachineStatus,
      setMode,
      homeMachine,
      jogAxis,
      runProgram,
      holdProgram,
      resumeProgram,
      stopProgram,
      setFeedOverride,
      setSpindleOverride,
      setSpindleSpeed,
      sendMdiCommand,
      uploadProgram,
      downloadProgram,
      listPrograms,
      deleteProgram,
      setToolOffset,
      getToolOffsets,
      setWorkOffset,
      getWorkOffsets,
      resetAlarms,
      convertToFanucFormat // Expose helper
    };
  }, [
    isConnecting,
    isConnected,
    error,
    availableMachines,
    selectedMachine,
    machineStatus,
    connectToServer,
    connectToMachine,
    connectToManualIp,
    disconnectFromMachine,
    sendCommand,
    convertToFanucFormat
  ]);
}

import React, { useState, useEffect } from "react";
import {
  Power,
  Home,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Play,
  Pause,
  StopCircle,
  AlertTriangle,
  Send,
  Wifi,
  WifiOff,
  CheckCircle,
  XCircle,
  ZoomIn,
  ZoomOut,
  Thermometer,
  Tool,
  RefreshCw
} from "react-feather";
import type { FanucStatus, FanucPosition } from "src/types/fanuc"; // Import shared types

// Define the props expected by this component
interface FanucMachineControlProps {
  machineStatus: FanucStatus | null;
  // Callbacks for actions - names match what parent passes
  onModeChange: (mode: FanucStatus["mode"]) => void;
  onHome: (axes?: ("X" | "Y" | "Z" | "A" | "B" | "C")[]) => void;
  onJog: (axis: "X" | "Y" | "Z" | "A" | "B" | "C", distance: number, feedRate?: number) => void;
  onRunProgram: () => void; // Changed: No longer takes programNumber, parent handles it
  onHold: () => void;
  onResume: () => void;
  onStop: () => void;
  onFeedOverrideChange: (value: number) => void;
  onSpindleOverrideChange: (value: number) => void;
  onSpindleSpeedChange: (value: number) => void;
  onMdiCommand: (command: string) => void;
  onProgramNumberChange: (value: number) => void; // Keep this if parent still passes it for display
}

const FanucMachineControl: React.FC<FanucMachineControlProps> = ({
  machineStatus, // Receive status as prop
  // Receive callbacks as props
  onModeChange,
  onHome,
  onJog,
  onRunProgram,
  onHold,
  onResume,
  onStop,
  onFeedOverrideChange,
  onSpindleOverrideChange,
  onSpindleSpeedChange,
  onMdiCommand,
  onProgramNumberChange // Keep if needed for display sync
}) => {
  // Internal state specific to this component's UI
  const [mdiCommand, setMdiCommand] = useState("");
  const [programNumberInput, setProgramNumberInput] = useState<number>(machineStatus?.program?.number || 1000);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [jogStep, setJogStep] = useState(1); // Default jog step size
  const [feedOverrideInput, setFeedOverrideInput] = useState<number>(machineStatus?.feedOverride || 100);
  const [spindleOverrideInput, setSpindleOverrideInput] = useState<number>(machineStatus?.spindleOverride || 100);
  const [spindleSpeedInput, setSpindleSpeedInput] = useState<number>(machineStatus?.spindleSpeed || 0);

  // Sync local inputs with machine status prop when it changes
  useEffect(() => {
    if (machineStatus) {
      setProgramNumberInput(machineStatus.program?.number || 0);
      setFeedOverrideInput(machineStatus.feedOverride);
      setSpindleOverrideInput(machineStatus.spindleOverride);
      setSpindleSpeedInput(machineStatus.spindleSpeed);
    }
  }, [machineStatus]);

  // Handlers that call the props
  const handleChangeMode = (mode: FanucStatus["mode"]) => {
    onModeChange(mode);
  };

  const handleHome = (axes?: ("X" | "Y" | "Z" | "A" | "B" | "C")[]) => {
    onHome(axes);
  };

  const handleJog = (axis: "X" | "Y" | "Z" | "A" | "B" | "C", distance: number) => {
    // Check if jogging is allowed in current mode (optional, parent hook might handle this)
    if (machineStatus && machineStatus.mode !== "JOG") {
      console.warn("Cannot jog: Machine not in JOG mode."); // Or display user feedback
      return;
    }
    onJog(axis, distance * jogStep); // Apply selected step size
  };

  const handleRunProgram = () => {
    if (machineStatus && machineStatus.mode !== "AUTO") {
      console.warn("Cannot run program: Machine not in AUTO mode.");
      return;
    }
    onRunProgram(); // Parent already knows the program number
  };

  const handleHoldProgram = () => {
    onHold();
  };

  const handleResumeProgram = () => {
    onResume();
  };

  const handleStopProgram = () => {
    onStop();
  };

  const handleFeedOverrideInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value)) {
      setFeedOverrideInput(value);
      onFeedOverrideChange(value);
    }
  };

  const handleSpindleOverrideInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value)) {
      setSpindleOverrideInput(value);
      onSpindleOverrideChange(value);
    }
  };

  const handleSpindleSpeedInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value)) {
      setSpindleSpeedInput(value);
      onSpindleSpeedChange(value);
    }
  };

  const handleSendMdiCommand = () => {
    if (!mdiCommand) return;
    if (machineStatus && machineStatus.mode !== "MDI") {
      console.warn("Cannot send MDI: Machine not in MDI mode.");
      return;
    }
    onMdiCommand(mdiCommand);
    setMdiCommand(""); // Clear input after sending
  };

  const handleProgramNumberInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value)) {
      setProgramNumberInput(value);
      if (onProgramNumberChange) {
        onProgramNumberChange(value); // Notify parent if needed
      }
    }
  };

  // Format time (if needed, otherwise remove)
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Get status color
  const getStatusColorClass = () => {
    if (!machineStatus) return "text-gray-500";

    switch (machineStatus.status) {
      case "READY":
      case "STOP":
      case "IDLE":
      case "RESET":
        return "text-blue-500";
      case "RUNNING":
      case "MSTR": // MDI Running
        return "text-green-500";
      case "HOLD":
        return "text-yellow-500";
      case "ALARM":
        return "text-red-500";
      default:
        return "text-gray-500";
    }
  };

  // Get mode name
  const getModeName = (mode: FanucStatus["mode"] | undefined) => {
    switch (mode) {
      case "AUTO":
        return "Auto";
      case "MDI":
        return "MDI";
      case "JOG":
        return "Jog";
      case "HANDLE":
        return "Handle";
      case "EDIT":
        return "Edit";
      case "REF":
        return "Reference";
      default:
        return "Unknown";
    }
  };

  // Disable controls based on status/mode
  const isControlDisabled = !machineStatus || machineStatus.status === "ALARM" || machineStatus.status === "RESET";
  const isRunning = machineStatus?.status === "RUNNING" || machineStatus?.status === "MSTR";
  const isHolding = machineStatus?.status === "HOLD";

  return (
    <div className="bg-[#F8FBFF] dark:bg-gray-800 dark:text-white p-4 rounded-md shadow-md">
      {/* Status Display */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            <span className={`font-medium ${getStatusColorClass()}`}>Status: {machineStatus?.status || "Unknown"}</span>
            {machineStatus && (
              <span className="ml-4 px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded-md">
                Mode: {getModeName(machineStatus.mode)}
              </span>
            )}
          </div>
          {/* Add connection indicator if needed, based on parent state */}
        </div>
        {machineStatus?.alarm && (
          <div className="mb-4 p-3 bg-red-50 rounded-md flex items-start">
            <AlertTriangle className="text-red-500 mr-2 flex-shrink-0 mt-0.5" size={18} />
            <p className="text-sm text-red-800">{machineStatus.alarm}</p>
          </div>
        )}
      </div>

      {/* Mode selection */}
      {machineStatus && (
        <>
          <div className="mb-6">
            <h3 className="text-md font-medium text-gray-800 mb-2">Operation Mode</h3>
            <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
              {(["AUTO", "MDI", "JOG", "HANDLE", "EDIT"] as FanucStatus["mode"][]).map(mode => (
                <button
                  key={mode}
                  onClick={() => handleChangeMode(mode)}
                  disabled={isControlDisabled || isRunning || isHolding} // Disable mode change during run/hold
                  className={`p-2 rounded-md text-sm font-medium ${
                    machineStatus.mode === mode
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-800 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  }`}
                >
                  {getModeName(mode)}
                </button>
              ))}
            </div>
          </div>

          {/* Position display */}
          <div className="mb-6">
            <h3 className="text-md font-medium text-gray-800 mb-2">Machine Position ({machineStatus.workOffset})</h3>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {["x", "y", "z"].map(axis => (
                <div key={axis} className="p-2 bg-gray-100 rounded-md text-center">
                  <span className="text-sm text-gray-600 uppercase">{axis}</span>
                  <div className="font-mono font-medium">
                    {(machineStatus.position?.[axis as keyof FanucPosition] as number)?.toFixed(3) ?? "---"}
                  </div>
                </div>
              ))}
            </div>
            {/* Optional A, B, C axes */}
            {(machineStatus.position?.a !== undefined ||
              machineStatus.position?.b !== undefined ||
              machineStatus.position?.c !== undefined) && (
              <div className="grid grid-cols-3 gap-2 mb-4">
                {["a", "b", "c"].map(
                  axis =>
                    machineStatus.position?.[axis as keyof FanucPosition] !== undefined && (
                      <div key={axis} className="p-2 bg-gray-100 rounded-md text-center">
                        <span className="text-sm text-gray-600 uppercase">{axis}</span>
                        <div className="font-mono font-medium">
                          {(machineStatus.position?.[axis as keyof FanucPosition] as number)?.toFixed(3)}
                        </div>
                      </div>
                    )
                )}
              </div>
            )}

            {/* Active tool */}
            <div className="p-2 bg-gray-100 rounded-md mb-4">
              <div className="flex items-center">
                <Tool size={16} className="mr-1 text-gray-600" />
                <span className="text-sm text-gray-600">Active Tool:</span>
                <span className="ml-2 font-medium">T{machineStatus.activeToolNumber ?? "--"}</span>
              </div>
            </div>

            {/* Home buttons */}
            <div className="flex space-x-2 mb-4">
              <button
                onClick={() => handleHome()}
                className="flex-1 px-2 py-1 bg-blue-100 text-blue-800 rounded-md text-sm font-medium hover:bg-blue-200 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={isControlDisabled || isRunning}
              >
                <Home size={16} className="mr-1" />
                Home All
              </button>
              {/* Add individual home buttons if needed */}
            </div>

            {/* JOG mode controls */}
            {machineStatus.mode === "JOG" && (
              <>
                <h4 className="text-sm font-medium text-gray-700 mb-2">Jog Controls</h4>
                <div className="flex space-x-2 mb-2">
                  <span className="text-sm text-gray-600">Step:</span>
                  {[0.01, 0.1, 1, 10].map(step => (
                    <button
                      key={step}
                      onClick={() => setJogStep(step)}
                      className={`px-2 py-0.5 text-xs rounded-md ${jogStep === step ? "bg-blue-200 text-blue-800" : "bg-gray-100 text-gray-800"}`}
                      disabled={isControlDisabled || isRunning}
                    >
                      {step}mm
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {/* Y+ */}
                  <div></div>
                  <button
                    onClick={() => handleJog("Y", 1)}
                    className="p-2 bg-gray-200 rounded-md flex items-center justify-center hover:bg-gray-300 disabled:opacity-50"
                    disabled={isControlDisabled || isRunning}
                  >
                    <ArrowUp size={18} />
                  </button>
                  <div></div>
                  {/* X- */}
                  <button
                    onClick={() => handleJog("X", -1)}
                    className="p-2 bg-gray-200 rounded-md flex items-center justify-center hover:bg-gray-300 disabled:opacity-50"
                    disabled={isControlDisabled || isRunning}
                  >
                    <ArrowLeft size={18} />
                  </button>
                  {/* Z+ */}
                  <button
                    onClick={() => handleJog("Z", 1)}
                    className="p-2 bg-gray-200 rounded-md flex items-center justify-center hover:bg-gray-300 disabled:opacity-50"
                    disabled={isControlDisabled || isRunning}
                  >
                    <ArrowUp size={18} className="text-blue-600" />
                  </button>
                  {/* X+ */}
                  <button
                    onClick={() => handleJog("X", 1)}
                    className="p-2 bg-gray-200 rounded-md flex items-center justify-center hover:bg-gray-300 disabled:opacity-50"
                    disabled={isControlDisabled || isRunning}
                  >
                    <ArrowRight size={18} />
                  </button>
                  {/* Y- */}
                  <div></div>
                  <button
                    onClick={() => handleJog("Y", -1)}
                    className="p-2 bg-gray-200 rounded-md flex items-center justify-center hover:bg-gray-300 disabled:opacity-50"
                    disabled={isControlDisabled || isRunning}
                  >
                    <ArrowDown size={18} />
                  </button>
                  {/* Z- */}
                  <button
                    onClick={() => handleJog("Z", -1)}
                    className="p-2 bg-gray-200 rounded-md flex items-center justify-center hover:bg-gray-300 disabled:opacity-50"
                    disabled={isControlDisabled || isRunning}
                  >
                    <ArrowDown size={18} className="text-blue-600" />
                  </button>
                </div>
              </>
            )}

            {/* MDI mode controls */}
            {machineStatus.mode === "MDI" && (
              <div className="mb-4">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Manual Data Input</h4>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={mdiCommand}
                    onChange={e => setMdiCommand(e.target.value.toUpperCase())}
                    placeholder="Enter G-code command (e.g. G0 X0 Y0)"
                    className="flex-1 px-3 py-2 border rounded-md disabled:bg-gray-100"
                    disabled={isControlDisabled || isRunning}
                  />
                  <button
                    onClick={handleSendMdiCommand}
                    disabled={!mdiCommand || isControlDisabled || isRunning}
                    className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Send size={18} />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Program Execution Controls (AUTO mode) */}
          {machineStatus.mode === "AUTO" && (
            <div className="mb-6">
              <h3 className="text-md font-medium text-gray-800 mb-2">Program Control</h3>
              <div className="flex space-x-2 mb-4 items-end">
                <div className="flex-1">
                  <label htmlFor="programNumber" className="block text-sm text-gray-600 mb-1">
                    Program Number
                  </label>
                  <input
                    type="number"
                    id="programNumber"
                    value={programNumberInput}
                    onChange={handleProgramNumberInputChange}
                    className="w-full px-3 py-2 border rounded-md disabled:bg-gray-100"
                    min="1"
                    max="99999" // Or higher if needed
                    disabled={isControlDisabled || isRunning || isHolding}
                  />
                </div>

                {!isRunning && !isHolding && (
                  <button
                    onClick={handleRunProgram}
                    disabled={isControlDisabled}
                    className="px-3 py-2 bg-green-600 text-white rounded-md font-medium hover:bg-green-700 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Play size={18} className="mr-1" />
                    Start
                  </button>
                )}

                {isRunning && (
                  <button
                    onClick={handleHoldProgram}
                    disabled={isControlDisabled}
                    className="px-3 py-2 bg-yellow-600 text-white rounded-md font-medium hover:bg-yellow-700 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Pause size={18} className="mr-1" />
                    Pause
                  </button>
                )}

                {isHolding && (
                  <button
                    onClick={handleResumeProgram}
                    disabled={isControlDisabled}
                    className="px-3 py-2 bg-green-600 text-white rounded-md font-medium hover:bg-green-700 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Play size={18} className="mr-1" />
                    Resume
                  </button>
                )}

                {(isRunning || isHolding) && (
                  <button
                    onClick={handleStopProgram}
                    disabled={isControlDisabled}
                    className="px-3 py-2 bg-red-600 text-white rounded-md font-medium hover:bg-red-700 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <StopCircle size={18} className="mr-1" />
                    Stop
                  </button>
                )}
              </div>

              {machineStatus.program?.number > 0 && (
                <>
                  <div className="mb-2">
                    <div className="flex justify-between text-sm text-gray-600 mb-1">
                      <span>Program: {machineStatus.program.name}</span>
                      <span>Progress: {machineStatus.program.progress?.toFixed(0) ?? 0}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2.5">
                      <div
                        className="bg-blue-600 h-2.5 rounded-full transition-width duration-300 ease-linear"
                        style={{ width: `${machineStatus.program.progress?.toFixed(0) ?? 0}%` }}
                      ></div>
                    </div>
                  </div>
                  <div className="p-2 bg-gray-100 rounded-md text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Block:</span>
                      <span className="font-medium">N{machineStatus.program.block ?? "--"}</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Feed and Spindle controls */}
          <div className="mb-6">
            <h3 className="text-md font-medium text-gray-800 mb-2">Overrides & Speed</h3>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label htmlFor="feedOverride" className="block text-sm font-medium text-gray-700">
                    Feed Override: {feedOverrideInput.toFixed(0)}%
                  </label>
                  <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-800 rounded-md">
                    F: {machineStatus.feedRate?.toFixed(0) ?? "--"} mm/min
                  </span>
                </div>
                <input
                  type="range"
                  id="feedOverride"
                  min="0"
                  max="200"
                  step="10"
                  value={feedOverrideInput}
                  onChange={handleFeedOverrideInputChange}
                  disabled={isControlDisabled}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer disabled:opacity-50"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label htmlFor="spindleOverride" className="block text-sm font-medium text-gray-700">
                    Spindle Override: {spindleOverrideInput.toFixed(0)}%
                  </label>
                  <div className="flex items-center">
                    <div
                      className={`h-3 w-3 rounded-full mr-1 ${machineStatus.spindleSpeed > 0 ? "bg-green-500 animate-pulse" : "bg-gray-300"}`}
                    ></div>
                    <span className="text-xs text-gray-500">
                      {machineStatus.spindleSpeed > 0 ? "Running" : "Stopped"}
                    </span>
                  </div>
                </div>
                <input
                  type="range"
                  id="spindleOverride"
                  min="50"
                  max="150"
                  step="10"
                  value={spindleOverrideInput}
                  onChange={handleSpindleOverrideInputChange}
                  disabled={isControlDisabled}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer disabled:opacity-50"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label htmlFor="spindleSpeed" className="block text-sm font-medium text-gray-700">
                    Spindle Speed: {spindleSpeedInput} RPM
                  </label>
                </div>
                <div className="flex space-x-2">
                  <input
                    type="range"
                    id="spindleSpeed"
                    min="0"
                    max="24000" // Adjust max based on machine
                    step="100"
                    value={spindleSpeedInput}
                    onChange={handleSpindleSpeedInputChange}
                    disabled={isControlDisabled || isRunning}
                    className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer disabled:opacity-50"
                  />
                  {/* Optional Button to apply speed via MDI */}
                  <button onClick={() => onMdiCommand(`S${spindleSpeedInput}`)} className="...">
                    Set Speed
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Advanced Settings Toggle */}
          {/* ... (keep advanced settings section if needed) ... */}
        </>
      )}

      {!machineStatus && <div className="text-center text-gray-500 py-8">Waiting for machine status...</div>}
    </div>
  );
};

export default FanucMachineControl;

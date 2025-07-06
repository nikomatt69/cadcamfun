// Start of Selection
import React, { useState, useEffect, useCallback } from "react";
import { useFanucConnection } from "src/hooks/useFanucConnection";
import { useFanucGcodeGenerator } from "src/hooks/useFanucGcodeGenerator";
import FanucMachineControl from "src/components/cam/FanucMachineController";
import type { CncProgram, ToolOffsets, WorkOffset, FanucStatus } from "src/types/fanuc";
import {
  AlertTriangle,
  RefreshCw,
  Save,
  Upload,
  FileText,
  Download,
  Plus,
  Trash,
  Settings,
  Tool,
  Cpu
} from "react-feather";

const CNCControlPage: React.FC = () => {
  // State for the G-code editor
  const [gcodeInput, setGcodeInput] = useState<string>("");
  const [programNumber, setProgramNumber] = useState<number>(1000);
  const [currentTab, setCurrentTab] = useState<"machine" | "program" | "tools" | "settings">("machine");
  // State for manual IP/Port connection
  const [manualIp, setManualIp] = useState<string>("");
  const [manualPort, setManualPort] = useState<string>("8193"); // Default FOCAS port

  // Hooks for connection and G-code generation
  const fanuc = useFanucConnection();
  const gcodeGenerator = useFanucGcodeGenerator();

  // List of programs available on the machine
  const [programs, setPrograms] = useState<CncProgram[]>([]);
  const [loadingPrograms, setLoadingPrograms] = useState(false);

  // Load the program list when connected
  const refreshProgramList = useCallback(async () => {
    if (!fanuc.isConnected) return;
    setLoadingPrograms(true);
    try {
      const programList = await fanuc.listPrograms();
      setPrograms(programList);
    } catch (error) {
      console.error("Error loading the program list:", error);
    } finally {
      setLoadingPrograms(false);
    }
  }, [fanuc.isConnected, fanuc.listPrograms]);

  useEffect(() => {
    if (fanuc.isConnected) {
      refreshProgramList();
      setCurrentTab("machine");
    } else {
      setPrograms([]);
    }
  }, [fanuc.isConnected, refreshProgramList]);

  // Download a program from the CNC machine
  const handleDownloadProgram = async (progNumber: number) => {
    try {
      const programContent = await fanuc.downloadProgram(progNumber);
      setGcodeInput(programContent);
      setProgramNumber(progNumber);
      setCurrentTab("program");
    } catch (error) {
      console.error(`Error downloading program O${progNumber}:`, error);
      alert(`Error downloading the program: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  // Upload the current program to the CNC machine
  const handleUploadProgram = async () => {
    try {
      if (!gcodeInput.trim()) {
        alert("The program is empty");
        return;
      }

      // Convert the G-code to Fanuc format if needed
      const fanucCode = fanuc.convertToFanucFormat(gcodeInput, programNumber);

      // Upload the program to the machine
      await fanuc.uploadProgram(programNumber, fanucCode);

      // Refresh the program list
      await refreshProgramList();

      alert(`Program O${programNumber} uploaded successfully`);
    } catch (error) {
      alert(`Error uploading the program: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  // Delete a program from the CNC machine
  const handleDeleteProgram = async (progNumber: number) => {
    if (!confirm(`Are you sure you want to delete program O${progNumber}?`)) {
      return;
    }

    try {
      await fanuc.deleteProgram(progNumber);
      await refreshProgramList();
      alert(`Program O${progNumber} deleted successfully`);
    } catch (error) {
      alert(`Error deleting the program: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  // Generate a simple drilling program
  const handleGenerateDrillingProgram = () => {
    const drillingCode = gcodeGenerator.generateDrillingProgram({
      programNumber: programNumber,
      toolNumber: 1,
      drillDiameter: 8,
      spindleSpeed: 2000,
      feedRate: 150,
      safeZ: 50,
      drillDepth: -15,
      retractHeight: 5,
      holes: [
        { x: 10, y: 10 },
        { x: 10, y: 50 },
        { x: 50, y: 50 },
        { x: 50, y: 10 }
      ]
    });

    setGcodeInput(drillingCode);
    setCurrentTab("program");
  };

  // Create a new program
  const handleNewProgram = () => {
    const maxProgNum = programs.reduce((max, p) => Math.max(max, p.number), 0);
    const newProgramNumber = Math.max(programNumber, maxProgNum) + 1;
    setProgramNumber(newProgramNumber);
    setGcodeInput(
      `%\nO${String(newProgramNumber).padStart(4, "0")}\n(NEW PROGRAM)\nN10 G21 G17 G40 G49 G80 G90\nN20 T1 M6\nN30 G0 G90 G54 X0 Y0\nN40 S2000 M3\nN50 G43 H1 Z50.0\nN60 G0 Z5.0\nN70 G1 Z-5.0 F100\nN80 G1 X50.0 F200\nN90 G1 Y50.0\nN100 G1 X0\nN110 G1 Y0\nN120 G0 Z50.0\nN130 M5\nN140 G91 G28 Z0 M9\nN150 G28 X0 Y0\nN160 M30\n%`
    );
    setCurrentTab("program");
  };

  // Handler for manual connection
  const handleManualConnect = () => {
    const portNumber = parseInt(manualPort);
    if (manualIp && !isNaN(portNumber)) {
      // Assume connectToManualIp exists on the hook for now
      // This will require changes in useFanucConnection and server.js
      if (fanuc.connectToManualIp) {
        fanuc.connectToManualIp(manualIp, portNumber);
      } else {
        console.error("Manual IP connection function not yet implemented in useFanucConnection hook.");
        alert("Manual IP connection is not yet supported.");
      }
    } else {
      alert("Please enter a valid IP address and Port number.");
    }
  };

  return (
    <div className="flex flex-col h-full p-2 sm:p-3">
      {/* Connection Area */}
      {!fanuc.selectedMachine ? (
        <div className="bg-white dark:bg-gray-800 p-3 rounded-lg shadow-md mb-3">
          <h2 className="text-base sm:text-lg font-semibold mb-2">CNC Connection</h2>

          {fanuc.error && (
            <div className="mb-2 p-2 bg-red-50 dark:bg-red-900/30 rounded-md flex items-start">
              <AlertTriangle className="text-red-500 mr-1.5 flex-shrink-0 mt-0.5" size={14} />
              <p className="text-xs text-red-800 dark:text-red-200">Error: {fanuc.error}</p>
            </div>
          )}

          <div className="mb-2">
            <p className="mb-1.5 text-gray-700 dark:text-gray-300 text-xs sm:text-sm">Choose a machine:</p>
            {fanuc.availableMachines.length === 0 && !fanuc.isConnecting && (
              <p className="text-xs text-gray-500 dark:text-gray-400 italic">No machines available.</p>
            )}
            <div className="grid grid-cols-1 gap-1.5">
              {fanuc.availableMachines.map(machine => (
                <button
                  key={machine.id}
                  onClick={() => fanuc.connectToMachine(machine.id)}
                  disabled={fanuc.isConnecting}
                  className="p-2 border dark:border-gray-600 rounded-md hover:bg-blue-50 dark:hover:bg-gray-700 flex items-center justify-between disabled:opacity-50 disabled:cursor-wait text-left"
                >
                  <div>
                    <div className="font-medium text-xs sm:text-sm dark:text-gray-100">{machine.name}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {machine.ip}:{machine.port}
                    </div>
                  </div>
                  {fanuc.isConnecting && <RefreshCw size={16} className="text-blue-500 animate-spin" />}
                </button>
              ))}
            </div>
          </div>

          {/* Manual Connection Input - Always stacked */}
          <div className="mt-3 pt-2 border-t dark:border-gray-600">
            <h3 className="text-sm sm:text-base font-medium mb-1.5">Connect Manually</h3>
            <div className="flex flex-col gap-1.5">
              <div>
                <label
                  htmlFor="manualIpInput"
                  className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5"
                >
                  IP Address
                </label>
                <input
                  id="manualIpInput"
                  type="text"
                  value={manualIp}
                  onChange={e => setManualIp(e.target.value)}
                  placeholder="e.g., 192.168.1.100"
                  className="w-full px-2 py-1 border dark:border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500 text-xs dark:bg-gray-700 dark:text-gray-200"
                  disabled={fanuc.isConnecting}
                />
              </div>
              <div>
                <label
                  htmlFor="manualPortInput"
                  className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-0.5"
                >
                  Port
                </label>
                <input
                  id="manualPortInput"
                  type="number"
                  value={manualPort}
                  onChange={e => setManualPort(e.target.value)}
                  placeholder="e.g., 8193"
                  className="w-full px-2 py-1 border dark:border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500 text-xs dark:bg-gray-700 dark:text-gray-200"
                  disabled={fanuc.isConnecting}
                />
              </div>
              <button
                onClick={handleManualConnect}
                disabled={fanuc.isConnecting || !manualIp || !manualPort}
                className="mt-1 w-full px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap text-xs sm:text-sm"
              >
                {fanuc.isConnecting ? <RefreshCw size={16} className="animate-spin mx-auto" /> : "Connect"}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md mb-3 flex-grow flex flex-col overflow-hidden">
          <div className="border-b dark:border-gray-600 px-3 py-2 flex justify-between items-center flex-shrink-0">
            <div>
              <h2
                className="text-sm sm:text-base font-semibold dark:text-gray-100 truncate"
                title={fanuc.selectedMachine?.name}
              >
                {fanuc.selectedMachine?.name}
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {fanuc.selectedMachine?.ip}:{fanuc.selectedMachine?.port}
              </p>
            </div>
            <button
              onClick={() => fanuc.disconnectFromMachine()}
              className="px-2 py-1 bg-red-100 text-red-800 rounded-md hover:bg-red-200 text-xs"
            >
              Disconnect
            </button>
          </div>

          <div className="border-b dark:border-gray-600 flex-shrink-0">
            <nav className="flex justify-around">
              {[
                { key: "machine", label: "Machine", icon: Cpu },
                { key: "program", label: "Programs", icon: FileText },
                { key: "tools", label: "Tools", icon: Tool },
                { key: "settings", label: "Settings", icon: Settings }
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setCurrentTab(tab.key as any)}
                  className={`flex flex-col sm:flex-row items-center justify-center flex-grow px-1 py-1.5 sm:px-2 text-xs font-medium ${
                    currentTab === tab.key
                      ? "border-b-2 border-blue-500 text-blue-600 dark:text-blue-400"
                      : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                  }`}
                  title={tab.label}
                >
                  <tab.icon size={14} className="mb-0.5 sm:mb-0 sm:mr-1" />
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              ))}
            </nav>
          </div>

          <div className="p-2 sm:p-3 flex-grow overflow-y-auto text-xs">
            {currentTab === "machine" && (
              <div>
                {fanuc.error && (
                  <div className="mb-2 p-2 bg-red-50 dark:bg-red-900/30 rounded-md flex items-start">
                    <AlertTriangle className="text-red-500 mr-1.5 flex-shrink-0 mt-0.5" size={14} />
                    <p className="text-xs text-red-800 dark:text-red-200">Error: {fanuc.error}</p>
                  </div>
                )}

                <FanucMachineControl
                  machineStatus={fanuc.machineStatus}
                  onModeChange={fanuc.setMode}
                  onHome={fanuc.homeMachine}
                  onJog={fanuc.jogAxis}
                  onRunProgram={() => fanuc.runProgram(programNumber)}
                  onHold={fanuc.holdProgram}
                  onResume={fanuc.resumeProgram}
                  onStop={fanuc.stopProgram}
                  onFeedOverrideChange={fanuc.setFeedOverride}
                  onSpindleOverrideChange={fanuc.setSpindleOverride}
                  onSpindleSpeedChange={fanuc.setSpindleSpeed}
                  onMdiCommand={fanuc.sendMdiCommand}
                  onProgramNumberChange={setProgramNumber}
                />
              </div>
            )}

            {currentTab === "program" && (
              <div>
                <div className="mb-3 flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2">
                  <div>
                    <h2 className="text-sm sm:text-base font-semibold mb-1">Program Editor</h2>
                    <div className="flex items-center">
                      <label htmlFor="progNumInput" className="mr-1.5 text-xs">
                        Number (O):
                      </label>
                      <input
                        id="progNumInput"
                        type="number"
                        min="1"
                        max="99999"
                        value={programNumber}
                        onChange={e => setProgramNumber(parseInt(e.target.value) || 0)}
                        className="w-16 px-1.5 py-0.5 border dark:border-gray-600 rounded-md text-xs dark:bg-gray-700 dark:text-gray-200"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1">
                    <button
                      onClick={handleNewProgram}
                      className="px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded-md hover:bg-blue-200 flex items-center text-xs"
                    >
                      <Plus size={12} className="mr-0.5" />
                      New
                    </button>
                    <button
                      onClick={handleGenerateDrillingProgram}
                      className="px-1.5 py-0.5 bg-purple-100 text-purple-800 rounded-md hover:bg-purple-200 flex items-center text-xs"
                    >
                      <FileText size={12} className="mr-0.5" />
                      Example
                    </button>
                    <button
                      onClick={handleUploadProgram}
                      disabled={!gcodeInput.trim()}
                      className="px-1.5 py-0.5 bg-green-100 text-green-800 rounded-md hover:bg-green-200 flex items-center disabled:opacity-50 disabled:cursor-not-allowed text-xs"
                    >
                      <Upload size={12} className="mr-0.5" />
                      Upload
                    </button>
                  </div>
                </div>

                <div className="mb-3">
                  <textarea
                    value={gcodeInput}
                    onChange={e => setGcodeInput(e.target.value)}
                    className="w-full h-48 sm:h-64 font-mono p-2 border dark:border-gray-600 rounded-md text-xs leading-relaxed dark:bg-gray-700 dark:text-gray-200"
                    placeholder="G-code program..."
                    spellCheck="false"
                  />
                </div>

                <div>
                  <h3 className="text-sm sm:text-base font-semibold mb-1.5">Programs on Machine</h3>
                  <div className="overflow-x-auto border dark:border-gray-600 rounded-md">
                    <table className="min-w-full bg-white dark:bg-gray-800 text-xs">
                      <thead>
                        <tr className="bg-gray-50 dark:bg-gray-700">
                          <th className="px-2 py-1 text-left font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Prog
                          </th>
                          <th className="px-2 py-1 text-left font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Comment
                          </th>
                          <th className="px-2 py-1 text-left font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider hidden sm:table-cell">
                            Size
                          </th>
                          <th className="px-2 py-1 text-right font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            <button
                              onClick={refreshProgramList}
                              disabled={loadingPrograms}
                              className="p-0.5 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-full disabled:opacity-50 disabled:cursor-wait"
                              title="Refresh list"
                            >
                              {loadingPrograms ? (
                                <RefreshCw size={12} className="animate-spin" />
                              ) : (
                                <RefreshCw size={12} />
                              )}
                            </button>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                        {loadingPrograms ? (
                          <tr>
                            <td colSpan={4} className="px-2 py-2 text-center text-xs text-gray-500 dark:text-gray-400">
                              Loading...
                            </td>
                          </tr>
                        ) : programs.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="px-2 py-2 text-center text-xs text-gray-500 dark:text-gray-400">
                              No programs found.
                            </td>
                          </tr>
                        ) : (
                          programs.map(program => (
                            <tr key={program.number} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                              <td className="px-2 py-1 whitespace-nowrap text-xs font-medium text-gray-900 dark:text-gray-100">
                                {program.name}
                              </td>
                              <td className="px-2 py-1 whitespace-nowrap text-xs text-gray-500 dark:text-gray-300 truncate max-w-[100px] sm:max-w-xs">
                                {program.comment}
                              </td>
                              <td className="px-2 py-1 whitespace-nowrap text-xs text-gray-500 dark:text-gray-300 hidden sm:table-cell">
                                {program.size} bytes
                              </td>
                              <td className="px-2 py-1 whitespace-nowrap text-right text-xs space-x-1">
                                <button
                                  onClick={() => handleDownloadProgram(program.number)}
                                  className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 inline-flex items-center p-0.5 rounded hover:bg-blue-100 dark:hover:bg-blue-900/30"
                                  title="Download"
                                >
                                  <Download size={12} />
                                </button>
                                <button
                                  onClick={() => handleDeleteProgram(program.number)}
                                  className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 inline-flex items-center p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30"
                                  title="Delete"
                                >
                                  <Trash size={12} />
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {currentTab === "tools" && (
              <ToolSettingsTab
                onGetToolOffsets={fanuc.getToolOffsets}
                onSetToolOffset={fanuc.setToolOffset}
                onGetWorkOffsets={fanuc.getWorkOffsets}
                onSetWorkOffset={fanuc.setWorkOffset}
              />
            )}

            {currentTab === "settings" && (
              <div>
                <h2 className="text-sm sm:text-base font-semibold mb-2">Settings & Diagnostics</h2>

                <div className="space-y-2">
                  <div className="p-2 sm:p-3 bg-gray-50 dark:bg-gray-700 rounded-md">
                    <h3 className="font-medium mb-1.5 text-xs sm:text-sm">Controller Information</h3>
                    <div className="grid grid-cols-2 gap-0.5 text-xs">
                      <div className="text-gray-600 dark:text-gray-400">Model:</div>
                      <div className="dark:text-gray-200 truncate">{fanuc.selectedMachine?.name || "N/A"}</div>
                      <div className="text-gray-600 dark:text-gray-400">IP Address:</div>
                      <div className="dark:text-gray-200">{fanuc.selectedMachine?.ip}</div>
                      <div className="text-gray-600 dark:text-gray-400">Port:</div>
                      <div className="dark:text-gray-200">{fanuc.selectedMachine?.port}</div>
                    </div>
                  </div>

                  <div className="p-2 sm:p-3 bg-gray-50 dark:bg-gray-700 rounded-md">
                    <h3 className="font-medium mb-1.5 text-xs sm:text-sm">Alarms</h3>
                    {fanuc.machineStatus?.alarm ? (
                      <div className="p-1.5 sm:p-2 bg-red-50 dark:bg-red-900/30 rounded-md flex items-start">
                        <AlertTriangle className="text-red-500 mr-1.5 flex-shrink-0 mt-0.5" size={14} />
                        <p className="text-xs text-red-800 dark:text-red-200">{fanuc.machineStatus.alarm}</p>
                      </div>
                    ) : (
                      <p className="text-xs text-green-600 dark:text-green-400">No active alarms</p>
                    )}

                    <button
                      onClick={fanuc.resetAlarms}
                      disabled={!fanuc.machineStatus?.alarm}
                      className="mt-1.5 px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded-md text-xs hover:bg-blue-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Reset Alarms
                    </button>
                  </div>

                  <div className="p-2 sm:p-3 bg-gray-50 dark:bg-gray-700 rounded-md">
                    <h3 className="font-medium mb-1.5 text-xs sm:text-sm">MDI Diagnostics</h3>
                    <div className="flex flex-wrap gap-1">
                      <button
                        onClick={() => fanuc.sendMdiCommand("G0 G90 G54 X0 Y0 Z100;")}
                        disabled={fanuc.machineStatus?.mode !== "MDI"}
                        className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-md text-xs hover:bg-gray-300 dark:hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Test G0
                      </button>
                      <button
                        onClick={() => fanuc.sendMdiCommand("M3 S1000;")}
                        disabled={fanuc.machineStatus?.mode !== "MDI"}
                        className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-md text-xs hover:bg-gray-300 dark:hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Test Spindle
                      </button>
                      <button
                        onClick={() => fanuc.sendMdiCommand("M5;")}
                        disabled={fanuc.machineStatus?.mode !== "MDI"}
                        className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-md text-xs hover:bg-gray-300 dark:hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Stop Spindle
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Note: Machine must be in MDI mode.</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

interface ToolSettingsTabProps {
  onGetToolOffsets: (toolNumber: number) => Promise<ToolOffsets>;
  onSetToolOffset: (toolNumber: number, offsetType: number, value: number) => Promise<any>;
  onGetWorkOffsets: () => Promise<WorkOffset[]>;
  onSetWorkOffset: (offsetNumber: number, axis: string, value: number) => Promise<any>;
}

const ToolSettingsTab: React.FC<ToolSettingsTabProps> = ({
  onGetToolOffsets,
  onSetToolOffset,
  onGetWorkOffsets,
  onSetWorkOffset
}) => {
  const [toolNumber, setToolNumber] = useState(1);
  const [toolOffsets, setToolOffsets] = useState<ToolOffsets | null>(null);
  const [workOffsets, setWorkOffsets] = useState<WorkOffset[]>([]);
  const [loadingTools, setLoadingTools] = useState(false);
  const [loadingWcs, setLoadingWcs] = useState(false);
  const [editToolOffsets, setEditToolOffsets] = useState<{ length: number; radius: number } | null>(null);

  const loadToolOffsets = useCallback(async () => {
    setLoadingTools(true);
    try {
      const offsets = await onGetToolOffsets(toolNumber);
      setToolOffsets(offsets);
      if (offsets && typeof offsets.length === "number" && typeof offsets.radius === "number") {
        setEditToolOffsets({ length: offsets.length, radius: offsets.radius });
      } else {
        setEditToolOffsets(null);
      }
    } catch (error) {
      console.error("Error loading tool offsets:", error);
      alert(`Error loading offsets for T${toolNumber}: ${error instanceof Error ? error.message : String(error)}`);
      setToolOffsets(null);
      setEditToolOffsets(null);
    } finally {
      setLoadingTools(false);
    }
  }, [onGetToolOffsets, toolNumber]);

  const loadWorkOffsets = useCallback(async () => {
    setLoadingWcs(true);
    try {
      const offsets = await onGetWorkOffsets();
      setWorkOffsets(offsets);
    } catch (error) {
      console.error("Error loading work offsets:", error);
      alert(`Error loading work offsets: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoadingWcs(false);
    }
  }, [onGetWorkOffsets]);

  useEffect(() => {
    loadToolOffsets();
    loadWorkOffsets();
  }, [loadToolOffsets, loadWorkOffsets]);

  const updateToolOffset = async (type: "length" | "radius", value: number) => {
    if (!toolOffsets || editToolOffsets === null) return;
    setLoadingTools(true);
    try {
      const focasType = type === "length" ? 3 : 4;
      const geometryValue =
        type === "length" ? (toolOffsets.geometry?.length ?? 0) : (toolOffsets.geometry?.radius ?? 0);
      const wearValueToSet = value - geometryValue;

      console.log(
        `Updating T${toolNumber} Wear ${type === "length" ? "Length (3)" : "Radius (4)"} to achieve total ${value}. Calculated wear: ${wearValueToSet}`
      );

      await onSetToolOffset(toolNumber, focasType, wearValueToSet);

      await loadToolOffsets();
    } catch (error) {
      console.error(`Error updating ${type} for T${toolNumber}:`, error);
      alert(`Error updating offset: ${error instanceof Error ? error.message : String(error)}`);
      await loadToolOffsets();
    } finally {
      setLoadingTools(false);
    }
  };

  const updateWorkOffset = async (offsetNumber: number, axis: string, value: number) => {
    setLoadingWcs(true);
    try {
      await onSetWorkOffset(offsetNumber, axis, value);
      await loadWorkOffsets();
    } catch (error) {
      console.error(`Error updating WCS ${offsetNumber} axis ${axis}:`, error);
      alert(`Error updating WCS: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoadingWcs(false);
    }
  };

  const handleToolNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const num = parseInt(e.target.value) || 1;
    setToolNumber(num);
  };

  const handleEditOffsetChange = (type: "length" | "radius", value: string) => {
    setEditToolOffsets(prev => {
      if (!prev) return null;
      return { ...prev, [type]: parseFloat(value) || 0 };
    });
  };

  return (
    <div className="text-xs">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div>
          <h2 className="text-sm sm:text-base font-semibold mb-2">Tool Offsets</h2>

          <div className="mb-2 flex flex-wrap items-end gap-1.5">
            <div>
              <label htmlFor="toolNumInput" className="block text-xs text-gray-600 dark:text-gray-400 mb-0.5">
                Number (T):
              </label>
              <input
                id="toolNumInput"
                type="number"
                min="1"
                value={toolNumber}
                onChange={handleToolNumberChange}
                className="w-16 px-1.5 py-0.5 border dark:border-gray-600 rounded-md text-xs dark:bg-gray-700 dark:text-gray-200"
              />
            </div>
            <button
              onClick={loadToolOffsets}
              disabled={loadingTools}
              className="px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded-md hover:bg-blue-200 flex items-center disabled:opacity-50 disabled:cursor-wait text-xs"
            >
              {loadingTools ? (
                <RefreshCw size={12} className="mr-0.5 animate-spin" />
              ) : (
                <RefreshCw size={12} className="mr-0.5" />
              )}
              Load T{toolNumber}
            </button>
          </div>

          {loadingTools && <p className="text-xs text-gray-500 dark:text-gray-400">Loading...</p>}

          {!loadingTools && !toolOffsets && (
            <p className="text-xs text-red-600 dark:text-red-400">No offsets for T{toolNumber}.</p>
          )}

          {editToolOffsets && toolOffsets && (
            <div className="p-2 sm:p-3 bg-gray-50 dark:bg-gray-700 rounded-md">
              <div className="mb-2">
                <h3 className="font-medium mb-1.5 text-xs sm:text-sm">T{toolOffsets.toolNumber} Offsets</h3>

                <div className="space-y-1.5">
                  <div className="text-xs text-gray-500 dark:text-gray-400 leading-tight">
                    Geom L: {toolOffsets.geometry?.length.toFixed(3) ?? "-"} / R:{" "}
                    {toolOffsets.geometry?.radius.toFixed(3) ?? "-"}
                    <br />
                    Wear L: {toolOffsets.wear?.length.toFixed(3) ?? "-"} / R:{" "}
                    {toolOffsets.wear?.radius.toFixed(3) ?? "-"}
                  </div>

                  <div>
                    <label className="block text-xs text-gray-600 dark:text-gray-400 mb-0.5">Total Length (Z)</label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        step="0.001"
                        value={editToolOffsets.length.toFixed(3)}
                        onChange={e => handleEditOffsetChange("length", e.target.value)}
                        className="w-24 px-1.5 py-0.5 border dark:border-gray-600 rounded-md text-xs dark:bg-gray-700 dark:text-gray-200"
                      />
                      <button
                        onClick={() => updateToolOffset("length", editToolOffsets.length)}
                        disabled={loadingTools}
                        className="px-1.5 py-0.5 bg-green-100 text-green-800 rounded-md hover:bg-green-200 text-xs disabled:opacity-50"
                      >
                        Update
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-gray-600 dark:text-gray-400 mb-0.5">Total Radius</label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        step="0.001"
                        value={editToolOffsets.radius.toFixed(3)}
                        onChange={e => handleEditOffsetChange("radius", e.target.value)}
                        className="w-24 px-1.5 py-0.5 border dark:border-gray-600 rounded-md text-xs dark:bg-gray-700 dark:text-gray-200"
                      />
                      <button
                        onClick={() => updateToolOffset("radius", editToolOffsets.radius)}
                        disabled={loadingTools}
                        className="px-1.5 py-0.5 bg-green-100 text-green-800 rounded-md hover:bg-green-200 text-xs disabled:opacity-50"
                      >
                        Update
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div>
          <h2 className="text-sm sm:text-base font-semibold mb-2">Work Offsets (WCS)</h2>

          <div className="mb-2">
            <button
              onClick={loadWorkOffsets}
              disabled={loadingWcs}
              className="px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded-md hover:bg-blue-200 flex items-center disabled:opacity-50 disabled:cursor-wait text-xs"
            >
              {loadingWcs ? (
                <RefreshCw size={12} className="mr-0.5 animate-spin" />
              ) : (
                <RefreshCw size={12} className="mr-0.5" />
              )}
              Load WCS
            </button>
          </div>

          {loadingWcs && <p className="text-xs text-gray-500 dark:text-gray-400">Loading WCS...</p>}

          {workOffsets.length > 0 && (
            <div className="overflow-x-auto border dark:border-gray-600 rounded-md">
              <table className="min-w-full bg-white dark:bg-gray-800 text-xs">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-700">
                    <th className="px-1.5 sm:px-2 py-1 text-left font-medium text-gray-500 dark:text-gray-400 uppercase">
                      WCS
                    </th>
                    <th className="px-1.5 sm:px-2 py-1 text-left font-medium text-gray-500 dark:text-gray-400 uppercase">
                      X
                    </th>
                    <th className="px-1.5 sm:px-2 py-1 text-left font-medium text-gray-500 dark:text-gray-400 uppercase">
                      Y
                    </th>
                    <th className="px-1.5 sm:px-2 py-1 text-left font-medium text-gray-500 dark:text-gray-400 uppercase">
                      Z
                    </th>
                    <th className="px-1.5 sm:px-2 py-1 text-right font-medium text-gray-500 dark:text-gray-400 uppercase"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                  {workOffsets.map(offset => (
                    <tr key={offset.number} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-1.5 sm:px-2 py-1 whitespace-nowrap font-medium dark:text-gray-200">
                        {offset.name}
                      </td>
                      {["x", "y", "z"].map(axis => (
                        <td key={axis} className="px-1.5 sm:px-2 py-0.5 whitespace-nowrap">
                          <input
                            type="number"
                            step="0.001"
                            value={
                              (
                                workOffsets.find(o => o.number === offset.number)?.[axis as keyof WorkOffset] as number
                              )?.toFixed(3) ?? ""
                            }
                            onChange={e => {
                              const newOffsets = [...workOffsets];
                              const index = newOffsets.findIndex(o => o.number === offset.number);
                              if (index !== -1) {
                                newOffsets[index] = { ...newOffsets[index], [axis]: parseFloat(e.target.value) || 0 };
                                setWorkOffsets(newOffsets);
                              }
                            }}
                            onBlur={() =>
                              updateWorkOffset(
                                offset.number,
                                axis.toUpperCase(),
                                offset[axis as keyof WorkOffset] as number
                              )
                            }
                            className="w-16 sm:w-20 px-1.5 py-0.5 border dark:border-gray-600 rounded-md text-xs dark:bg-gray-700 dark:text-gray-200"
                          />
                        </td>
                      ))}
                      <td className="px-1.5 sm:px-2 py-0.5 whitespace-nowrap text-right">
                        <button
                          onClick={async () => {
                            const currentOffset = workOffsets.find(o => o.number === offset.number);
                            if (!currentOffset) return;
                            setLoadingWcs(true);
                            try {
                              await updateWorkOffset(offset.number, "X", currentOffset.x);
                              await updateWorkOffset(offset.number, "Y", currentOffset.y);
                              await updateWorkOffset(offset.number, "Z", currentOffset.z);
                            } finally {
                              setLoadingWcs(false);
                            }
                          }}
                          className="px-1.5 py-0.5 bg-green-100 text-green-800 rounded-md hover:bg-green-200 text-xs disabled:opacity-50"
                          disabled={loadingWcs}
                          title="Update all axes for this WCS"
                        >
                          Save
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CNCControlPage;
// End of Selectio

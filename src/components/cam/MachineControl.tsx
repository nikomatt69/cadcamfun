// Src/Components/Cam/Machine Control.tsx
import React, { useState } from 'react';
import { 
  Power, Home, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, 
  Play, Pause, StopCircle, AlertTriangle, Send, Wifi, WifiOff,
  CheckCircle, XCircle, ZoomIn, ZoomOut, Thermometer
} from 'react-feather';

interface MachineControlProps {
  gcode: string;
}

type MachineStatus = 'disconnected' | 'idle' | 'running' | 'paused' | 'error';

const MachineControl: React.FC<MachineControlProps> = ({ gcode }) => {
  const [machineStatus, setMachineStatus] = useState<MachineStatus>('disconnected');
  const [isConnected, setIsConnected] = useState(false);
  const [progress, setProgress] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [estimatedTime, setEstimatedTime] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState({ x: 0, y: 0, z: 0 });
  const [feedRate, setFeedRate] = useState(100);
  const [spindleSpeed, setSpindleSpeed] = useState(0);
  const [showAdvanced, setShowAdvanced] = useState(false);
  
  // Simulated machine connection
  const connectToMachine = () => {
    setError(null);
    setIsConnected(true);
    setMachineStatus('idle');
    
    // Simulated initial machine date
    setPosition({ x: 0, y: 0, z: 10 });
    setSpindleSpeed(0);
    
    if (gcode) {
      // Estimates the approximate time based on the number of lines
      const lineCount = gcode.split('\n').filter(line => line.trim()).length;
      setEstimatedTime(Math.round(lineCount * 0.5)); // Rozza estimate: 0.5 seconds per line
    }
  };
  
  // Simulated machine disconnection
  const disconnectFromMachine = () => {
    setIsConnected(false);
    setMachineStatus('disconnected');
    setProgress(0);
    setElapsedTime(0);
    setEstimatedTime(0);
  };
  
  // Simulated home command
  const homeAxis = (axis?: 'x' | 'y' | 'z') => {
    if (!isConnected) return;
    
    setError(null);
    
    if (axis) {
      setPosition(prev => ({ ...prev, [axis]: 0 }));
    } else {
      setPosition({ x: 0, y: 0, z: 10 });
    }
  };
  
  // Simulated jog moovement
  const jogAxis = (axis: 'x' | 'y' | 'z', direction: 1 | -1, distance: number = 1) => {
    if (!isConnected || machineStatus !== 'idle') return;
    
    setError(null);
    setPosition(prev => ({
      ...prev,
      [axis]: prev[axis] + (direction * distance)
    }));
  };
  
  // Simulated program start
  const startProgram = () => {
    if (!isConnected || !gcode) return;
    
    setError(null);
    setMachineStatus('running');
    setProgress(0);
    setElapsedTime(0);
    
    // Simulate program execution with progress
    const interval = setInterval(() => {
      setProgress(prev => {
        const newProgress = prev + 1;
        setElapsedTime(prev => prev + 1);
        
        if (newProgress >= 100) {
          clearInterval(interval);
          setMachineStatus('idle');
          return 100;
        }
        return newProgress;
      });
    }, 1000);
  };
  
  // Simulated program pauses
  const pauseProgram = () => {
    if (!isConnected || machineStatus !== 'running') return;
    
    setMachineStatus('paused');
  };
  
  // Simulated program resume
  const resumeProgram = () => {
    if (!isConnected || machineStatus !== 'paused') return;
    
    setMachineStatus('running');
  };
  
  // Simulated program stop
  const stopProgram = () => {
    if (!isConnected || (machineStatus !== 'running' && machineStatus !== 'paused')) return;
    
    setMachineStatus('idle');
    setProgress(0);
    setElapsedTime(0);
  };
  
  // Update feed rate
  const handleFeedRateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    if (!isNaN(value) && value >= 10 && value <= 200) {
      setFeedRate(value);
    }
  };
  
  // Update spindle speed
  const handleSpindleSpeedChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    if (!isNaN(value) && value >= 0 && value <= 24000) {
      setSpindleSpeed(value);
    }
  };
  
  // Format time as mm:ss
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };
  
  // Get status color
  const getStatusColor = () => {
    switch (machineStatus) {
      case 'disconnected': return 'text-gray-500';
      case 'idle': return 'text-blue-500';
      case 'running': return 'text-green-500';
      case 'paused': return 'text-yellow-500';
      case 'error': return 'text-red-500';
      default: return 'text-gray-500';
    }
  };
  
  // Get status text
  const getStatusText = () => {
    switch (machineStatus) {
      case 'disconnected': return 'Disconnected';
      case 'idle': return 'Ready';
      case 'running': return 'Running';
      case 'paused': return 'Paused';
      case 'error': return 'Error';
      default: return 'Sconosciuto';
    }
  };
  
  return (
    <div className="bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white p-4 rounded-md shadow-md">
      <h2 className="text-xl font-semibold text-gray-900 mb-4">Machine control </h2>
      
      {/* Connection status and controls */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            {isConnected ? (
              <Wifi className="text-green-500 mr-2" size={20} />
            ) : (
              <WifiOff className="text-gray-500 mr-2" size={20} />
            )}
            <span className={`font-medium ${getStatusColor()}`}>
              {getStatusText()}
            </span>
          </div>
          
          <button
            onClick={isConnected ? disconnectFromMachine : connectToMachine}
            className={`px-3 py-1 rounded-md text-sm font-medium flex items-center ${
              isConnected 
                ? 'bg-red-100 text-red-800 hover:bg-red-200' 
                : 'bg-green-100 text-green-800 hover:bg-green-200'
            }`}
          >
            <Power size={16} className="mr-1" />
            {isConnected ? 'Disconnetti' : 'Connetti'}
          </button>
        </div>
        
        {!isConnected && (
          <div className="p-3 bg-blue-50 rounded-md">
            <p className="text-sm text-blue-800">
              Connect the machine to start sending controls and monitor the state.
            </p>
          </div>
        )}
      </div>
      
      {isConnected && (
        <>
          {/* Position display */}
          <div className="mb-6">
            <h3 className="text-md font-medium text-gray-800 mb-2">Current Position</h3>
            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="p-2 bg-gray-100 rounded-md text-center">
                <span className="text-sm text-gray-600">X</span>
                <div className="font-mono font-medium">{position.x.toFixed(2)}</div>
              </div>
              <div className="p-2 bg-gray-100 rounded-md text-center">
                <span className="text-sm text-gray-600">Y</span>
                <div className="font-mono font-medium">{position.y.toFixed(2)}</div>
              </div>
              <div className="p-2 bg-gray-100 rounded-md text-center">
                <span className="text-sm text-gray-600">Z</span>
                <div className="font-mono font-medium">{position.z.toFixed(2)}</div>
              </div>
            </div>
            
            {/* Home buttons */}
            <div className="flex space-x-2 mb-4">
              <button
                onClick={() => homeAxis()}
                className="flex-1 px-2 py-1 bg-blue-100 text-blue-800 rounded-md text-sm font-medium hover:bg-blue-200 flex items-center justify-center"
                disabled={machineStatus === 'running'}
              >
                X
              </button>
              <button
                onClick={() => homeAxis('y')}
                className="px-2 py-1 bg-blue-100 text-blue-800 rounded-md text-sm font-medium hover:bg-blue-200"
                disabled={machineStatus === 'running'}
              >
                Y
              </button>
            </div>
            
            {/* Jog controls */}
            <div className="mb-2">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Manual Movement</h4>
              <div className="grid grid-cols-3 gap-2">
                <div></div>
                <button
                  onClick={() => jogAxis('y', 1)}
                  className="p-2 bg-gray-200 rounded-md flex items-center justify-center hover:bg-gray-300"
                  disabled={machineStatus !== 'idle'}
                >
                  <ArrowUp size={18} />
                </button>
                <div></div>
                
                <button
                  onClick={() => jogAxis('x', -1)}
                  className="p-2 bg-gray-200 rounded-md flex items-center justify-center hover:bg-gray-300"
                  disabled={machineStatus !== 'idle'}
                >
                  <ArrowLeft size={18} />
                </button>
                <button
                  onClick={() => jogAxis('z', 1)}
                  className="p-2 bg-gray-200 rounded-md flex items-center justify-center hover:bg-gray-300"
                  disabled={machineStatus !== 'idle'}
                >
                  <ArrowUp size={18} className="text-blue-600" />
                </button>
                <button
                  onClick={() => jogAxis('x', 1)}
                  className="p-2 bg-gray-200 rounded-md flex items-center justify-center hover:bg-gray-300"
                  disabled={machineStatus !== 'idle'}
                >
                  <ArrowRight size={18} />
                </button>
                
                <div></div>
                <button
                  onClick={() => jogAxis('y', -1)}
                  className="p-2 bg-gray-200 rounded-md flex items-center justify-center hover:bg-gray-300"
                  disabled={machineStatus !== 'idle'}
                >
                  <ArrowDown size={18} />
                </button>
                <button
                  onClick={() => jogAxis('z', -1)}
                  className="p-2 bg-gray-200 rounded-md flex items-center justify-center hover:bg-gray-300"
                  disabled={machineStatus !== 'idle'}
                >
                  <ArrowDown size={18} className="text-blue-600" />
                </button>
              </div>
            </div>
            
            <div className="flex space-x-2">
              <button
                onClick={() => jogAxis('x', -1, 10)}
                className="flex-1 px-2 py-1 bg-gray-100 text-gray-800 rounded-md text-xs hover:bg-gray-200"
                disabled={machineStatus !== 'idle'}
              >
                X-10
              </button>
              <button
                onClick={() => jogAxis('x', 1, 10)}
                className="flex-1 px-2 py-1 bg-gray-100 text-gray-800 rounded-md text-xs hover:bg-gray-200"
                disabled={machineStatus !== 'idle'}
              >
                X+10
              </button>
              <button
                onClick={() => jogAxis('y', -1, 10)}
                className="flex-1 px-2 py-1 bg-gray-100 text-gray-800 rounded-md text-xs hover:bg-gray-200"
                disabled={machineStatus !== 'idle'}
              >
                Y-10
              </button>
              <button
                onClick={() => jogAxis('y', 1, 10)}
                className="flex-1 px-2 py-1 bg-gray-100 text-gray-800 rounded-md text-xs hover:bg-gray-200"
                disabled={machineStatus !== 'idle'}
              >
                Y+10
              </button>
            </div>
          </div>
          
          {/* Program Execution Controls */}
          <div className="mb-6">
            <h3 className="text-md font-medium text-gray-800 mb-2">Program Control</h3>
            
            <div className="flex space-x-2 mb-4">
              {machineStatus === 'idle' && (
                <button
                  onClick={startProgram}
                  className="flex-1 px-3 py-2 bg-green-600 text-white rounded-md font-medium hover:bg-green-700 flex items-center justify-center"
                  disabled={!gcode}
                >
                  <Play size={18} className="mr-1" />
                  Avvia
                </button>
              )}
              
              {machineStatus === 'running' && (
                <button
                  onClick={pauseProgram}
                  className="flex-1 px-3 py-2 bg-yellow-600 text-white rounded-md font-medium hover:bg-yellow-700 flex items-center justify-center"
                >
                  <Pause size={18} className="mr-1" />
                  Pausa
                </button>
              )}
              
              {machineStatus === 'paused' && (
                <button
                  onClick={resumeProgram}
                  className="flex-1 px-3 py-2 bg-green-600 text-white rounded-md font-medium hover:bg-green-700 flex items-center justify-center"
                >
                  <Play size={18} className="mr-1" />
                  Riprendi
                </button>
              )}
              
              {(machineStatus === 'running' || machineStatus === 'paused') && (
                <button
                  onClick={stopProgram}
                  className="flex-1 px-3 py-2 bg-red-600 text-white rounded-md font-medium hover:bg-red-700 flex items-center justify-center"
                >
                  <StopCircle size={18} className="mr-1" />
                  Ferma
                </button>
              )}
            </div>
            
            {!gcode && machineStatus === 'idle' && (
              <div className="p-3 bg-yellow-50 rounded-md mb-4">
                <p className="text-sm text-yellow-800">
                  No G-Code available. Generate a toolpath or load a file.
                </p>
              </div>
            )}
            
            {(machineStatus === 'running' || machineStatus === 'paused') && (
              <>
                <div className="mb-2">
                  <div className="flex justify-between text-sm text-gray-600 mb-1">
                    <span>Progress:</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <div 
                      className="bg-blue-600 h-2.5 rounded-full" 
                      style={{ width: `${progress}%` }}
                    ></div>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="p-2 bg-gray-100 rounded-md">
                    <span className="text-gray-600">Elapsed Time:</span>
                    <div className="font-medium">{formatTime(elapsedTime)}</div>
                  </div>
                  <div className="p-2 bg-gray-100 rounded-md">
                    <span className="text-gray-600">Estimated Time:</span>
                    <div className="font-medium">{formatTime(estimatedTime)}</div>
                  </div>
                </div>
              </>
            )}
          </div>
          
          {/* Feed rate and spindle control */}
          <div className="mb-6">
            <h3 className="text-md font-medium text-gray-800 mb-2">Parameters Control</h3>
            
            <div className="space-y-4">
              <div>
                <label htmlFor="feedRate" className="block text-sm font-medium text-gray-700 mb-1">
                  Feed Rate: {feedRate}%
                </label>
                <input
                  type="range"
                  id="feedRate"
                  min="10"
                  max="200"
                  value={feedRate}
                  onChange={handleFeedRateChange}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-xs text-gray-500">
                  <span>10%</span>
                  <span>100%</span>
                  <span>200%</span>
                </div>
              </div>
              
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label htmlFor="spindleSpeed" className="block text-sm font-medium text-gray-700">
                    Spindle Speed: {spindleSpeed} RPM
                  </label>
                  <div className="flex items-center">
                    <div className={`h-3 w-3 rounded-full mr-1 ${spindleSpeed > 0 ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                    <span className="text-xs text-gray-500">{spindleSpeed > 0 ? 'Active' : 'Inactive'}</span>
                  </div>
                </div>
                <input
                  type="range"
                  id="spindleSpeed"
                  min="0"
                  max="24000"
                  step="1000"
                  value={spindleSpeed}
                  onChange={handleSpindleSpeedChange}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-xs text-gray-500">
                  <span>0</span>
                  <span>12000</span>
                  <span>24000</span>
                </div>
              </div>
            </div>
          </div>
          
          {/* Advanced Settings Toggle */}
          <div>
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center text-sm text-gray-600 hover:text-gray-800"
            >
              {showAdvanced ? (
                <>
                  <ZoomOut size={16} className="mr-1" />
                  Nascondi Impostazioni Avanzate
                </>
              ) : (
                <>
                  <ZoomIn size={16} className="mr-1" />
                  Mostra Impostazioni Avanzate
                </>
              )}
            </button>
            
            {showAdvanced && (
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2 bg-gray-100 rounded-md">
                    <div className="flex items-center">
                      <Thermometer size={16} className="mr-1 text-gray-600" />
                      <span className="text-xs text-gray-600">Temperature:</span>
                    </div>
                    <div className="font-medium text-sm">35°C</div>
                  </div>
                  <div className="p-2 bg-gray-100 rounded-md">
                    <div className="flex items-center">
                      <CheckCircle size={16} className="mr-1 text-green-600" />
                      <span className="text-xs text-gray-600">Limit State:</span>
                    </div>
                    <div className="font-medium text-sm">All OK</div>
                  </div>
                </div>
                
                <div className="grid grid-cols-3 gap-2">
                  <button className="p-2 bg-gray-100 rounded-md text-sm text-gray-800 hover:bg-gray-200">
                    Unlock Alerts
                  </button>
                  <button className="p-2 bg-gray-100 rounded-md text-sm text-gray-800 hover:bg-gray-200">
                    Check Position
                  </button>
                  <button className="p-2 bg-gray-100 rounded-md text-sm text-gray-800 hover:bg-gray-200">
                    Save State
                  </button>
                </div>
                
                <div className="p-3 bg-gray-50 rounded-md">
                  <p className="text-xs text-gray-600">
                    Communication Buffer: <span className="font-mono">32/128</span>
                  </p>
                </div>
              </div>
            )}
          </div>
          
          {error && (
            <div className="mt-4 p-3 bg-red-50 rounded-md flex items-start">
              <AlertTriangle className="text-red-500 mr-2 flex-shrink-0 mt-0.5" size={18} />
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default MachineControl;
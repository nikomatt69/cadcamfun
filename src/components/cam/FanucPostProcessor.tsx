import React, { useState, useEffect } from 'react';
import { generateFanucGcode, FanucProgram, FanucMachineParameters } from 'src/lib/fanucGcodeGenerator';

interface FanucPostProcessorProps {
  initialGcode?: string;
  program?: FanucProgram;
  onProcessedGcode?: (gcode: string, validationResults?: any) => void;
}

const defaultMachineParameters: FanucMachineParameters = {
  controllerType: 'Fanuc 30i',
  highSpeedMode: false,
  nanoSmoothing: false,
  useAICC: false,
  programNumber: 'O1000',
  feedrateMode: 'per-minute',
  cuttingMode: 'G64',
  workOffset: 'G54',
  useDecimalPoint: true,
  maxBlockNumber: 9999,
  blockNumberIncrement: 10,
  toolChangePosition: { x: 0, y: 0, z: 100 },
  useSubPrograms: false,
  simulationValidation: true,
  maxFeedrate: 10000,
  maxSpindleSpeed: 12000,
  coolantOptions: {
    flood: true,
    mist: false,
    through: false
  },
  optimizationLevel: 'advanced'
};

const FanucPostProcessor: React.FC<FanucPostProcessorProps> = ({ 
  initialGcode = '', 
  program,
  onProcessedGcode 
}) => {
  const [inputGcode, setInputGcode] = useState(initialGcode);
  const [outputGcode, setOutputGcode] = useState('');
  const [machineParams, setMachineParams] = useState<FanucMachineParameters>(
    program?.machineParameters || defaultMachineParameters
  );
  const [validationResults, setValidationResults] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState<'input' | 'output' | 'validation' | 'settings'>('input');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (program?.machineParameters) {
      setMachineParams(program.machineParameters);
    }
  }, [program]);

  const handleProcessGcode = async () => {
    setIsProcessing(true);
    setErrorMessage(null);
    
    try {
      // If a full program is provided, use it directly
      if (program) {
        const result = generateFanucGcode({
          ...program,
          machineParameters: machineParams
        });
        
        setOutputGcode(result.gcode);
        setValidationResults(result.validationResults);
        
        if (onProcessedGcode) {
          onProcessedGcode(result.gcode, result.validationResults);
        }
      } else {
        // Otherwise, just apply post-processing to the input G-code
        // This is a simplified approach, as we don't have the full parsing logic here
        let processed = applyBasicPostProcessing(inputGcode, machineParams);
        
        setOutputGcode(processed);
        
        if (onProcessedGcode) {
          onProcessedGcode(processed);
        }
      }
      
      // Switch to output tab after processing
      setActiveTab('output');
    } catch (error) {
      console.error('Error processing G-code:', error);
      setErrorMessage(`Error processing G-code: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const applyBasicPostProcessing = (gcode: string, params: FanucMachineParameters): string => {
    // This is a simplified post-processing function for when we don't have the full program structure
    // In a real implementation, you would use the full generateFanucGcode function
    
    let processedGcode = gcode;
    
    // Add program number
    if (!processedGcode.includes(params.programNumber)) {
      processedGcode = `${params.programNumber}\n${processedGcode}`;
    }
    
    // Add percent sign at the beginning if not present
    if (!processedGcode.startsWith('%')) {
      processedGcode = `%\n${processedGcode}`;
    }
    
    // Ensure proper program end
    if (!processedGcode.includes('M30')) {
      processedGcode += '\nM30 (PROGRAM END)\n%';
    }
    
    // Add block numbers if specified
    if (params.blockNumberIncrement > 0) {
      const lines = processedGcode.split('\n');
      let blockNumber = 10; // Usually start at N10
      
      processedGcode = lines.map(line => {
        // Skip comments and empty lines for numbering
        if (line.trim() === '' || line.trim().startsWith('(') || line.trim().startsWith('%')) {
          return line;
        }
        
        // Skip lines that already have block numbers
        if (line.trim().match(/^N\d+/)) {
          return line;
        }
        
        const formattedNumber = blockNumber.toString().padStart(4, '0');
        blockNumber += params.blockNumberIncrement;
        return `N${formattedNumber} ${line}`;
      }).join('\n');
    }
    
    return processedGcode;
  };

  const handleMachineParamChange = (key: keyof FanucMachineParameters, value: any) => {
    setMachineParams((prev: any) => ({
      ...prev,
      [key]: value
    }));
  };
  const handleCoolantOptionChange = (option: keyof FanucMachineParameters['coolantOptions'], value: boolean) => {
    setMachineParams((prev: FanucMachineParameters) => ({
      ...prev,
      coolantOptions: {
        ...prev.coolantOptions,
        [option]: value
      }
    }));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputGcode(e.target.value);
  };

  const getSeverityColor = (severity: 'error' | 'warning' | 'info') => {
    switch (severity) {
      case 'error':
        return 'text-red-600 bg-red-50 border-red-200';
      case 'warning':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'info':
      default:
        return 'text-blue-600 bg-blue-50 border-blue-200';
    }
  };

  return (
    <div className="w-full bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white rounded-lg shadow-md overflow-hidden">
      {/* Header */}
      <div className="bg-gray-50 border-b border-gray-200 p-4">
        <h2 className="text-lg font-medium text-gray-900">Fanuc Post-Processor</h2>
        <p className="mt-1 text-sm text-gray-500">
          Optimize and validate G-code for Fanuc CNC controllers
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 px-4">
        <nav className="-mb-px flex space-x-4">
          <button
            onClick={() => setActiveTab('input')}
            className={`py-3 px-2 border-b-2 text-sm font-medium ${
              activeTab === 'input'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Input G-code
          </button>
          <button
            onClick={() => setActiveTab('output')}
            className={`py-3 px-2 border-b-2 text-sm font-medium ${
              activeTab === 'output'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Processed G-code
          </button>
          <button
            onClick={() => setActiveTab('validation')}
            className={`py-3 px-2 border-b-2 text-sm font-medium ${
              activeTab === 'validation'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Validation
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`py-3 px-2 border-b-2 text-sm font-medium ${
              activeTab === 'settings'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Settings
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      <div className="p-4">
        {activeTab === 'input' && (
          <div>
            <div className="mb-4">
              <label htmlFor="inputGcode" className="block text-sm font-medium text-gray-700 mb-1">
                Input G-code
              </label>
              <textarea
                id="inputGcode"
                rows={15}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                value={inputGcode}
                onChange={handleInputChange}
                placeholder="Paste your G-code here..."
              />
            </div>
            <div className="flex justify-end">
              <button
                onClick={handleProcessGcode}
                disabled={isProcessing || !inputGcode.trim()}
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 disabled:opacity-50"
              >
                {isProcessing ? 'Processing...' : 'Process G-code'}
              </button>
            </div>
            {errorMessage && (
              <div className="mt-4 p-3 text-red-700 bg-red-50 border border-red-200 rounded-md">
                {errorMessage}
              </div>
            )}
          </div>
        )}

        {activeTab === 'output' && (
          <div>
            <div className="mb-4">
              <label htmlFor="outputGcode" className="block text-sm font-medium text-gray-700 mb-1">
                Processed G-code
              </label>
              <textarea
                id="outputGcode"
                rows={15}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                value={outputGcode}
                readOnly
              />
            </div>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  const blob = new Blob([outputGcode], { type: 'text/plain' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'processed_gcode.nc';
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                }}
                disabled={!outputGcode}
                className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50 disabled:opacity-50"
              >
                Download
              </button>
              <button
                onClick={() => navigator.clipboard.writeText(outputGcode)}
                disabled={!outputGcode}
                className="bg-gray-500 text-white px-4 py-2 rounded-md hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-opacity-50 disabled:opacity-50"
              >
                Copy to Clipboard
              </button>
            </div>
          </div>
        )}

        {activeTab === 'validation' && (
          <div>
            <h3 className="text-md font-medium text-gray-900 mb-3">Validation Results</h3>
            
            {validationResults ? (
              <div>
                <div className={`p-3 rounded-md mb-4 border ${
                  validationResults.isValid 
                    ? 'text-green-700 bg-green-50 border-green-200' 
                    : 'text-red-700 bg-red-50 border-red-200'
                }`}>
                  <p className="font-medium">
                    {validationResults.isValid 
                      ? 'G-code Validation Passed' 
                      : 'G-code Validation Failed'}
                  </p>
                </div>
                
                {validationResults.errors && validationResults.errors.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Errors:</h4>
                    <ul className="space-y-1">
                      {validationResults.errors.map((error: string, idx: number) => (
                        <li 
                          key={`error-${idx}`}
                          className="p-2 rounded-md text-sm text-red-700 bg-red-50 border border-red-200"
                        >
                          {error}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {validationResults.warnings && validationResults.warnings.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Warnings:</h4>
                    <ul className="space-y-1">
                      {validationResults.warnings.map((warning: string, idx: number) => (
                        <li 
                          key={`warning-${idx}`}
                          className="p-2 rounded-md text-sm text-yellow-700 bg-yellow-50 border border-yellow-200"
                        >
                          {warning}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {validationResults.statistics && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Statistics:</h4>
                    <div className="bg-gray-50 p-3 rounded-md border border-gray-200">
                      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                        <dt className="text-gray-500">Estimated Time:</dt>
                        <dd className="text-gray-900">{(validationResults.statistics.estimatedMachiningTime / 60).toFixed(2)} min</dd>
                        
                        <dt className="text-gray-500">Rapid Distance:</dt>
                        <dd className="text-gray-900">{validationResults.statistics.totalRapidDistance.toFixed(2)} mm</dd>
                        
                        <dt className="text-gray-500">Cutting Distance:</dt>
                        <dd className="text-gray-900">{validationResults.statistics.totalCuttingDistance.toFixed(2)} mm</dd>
                        
                        <dt className="text-gray-500">Tool Changes:</dt>
                        <dd className="text-gray-900">{validationResults.statistics.toolChanges}</dd>
                        
                        <dt className="text-gray-500">Max Depth:</dt>
                        <dd className="text-gray-900">{validationResults.statistics.maxDepth.toFixed(2)} mm</dd>
                      </dl>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 text-center text-gray-500 bg-gray-50 rounded-md border border-gray-200">
                <p>No validation results available. Process G-code first.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'settings' && (
          <div>
            <h3 className="text-md font-medium text-gray-900 mb-3">Machine Settings</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Controller Type */}
              <div>
                <label htmlFor="controllerType" className="block text-sm font-medium text-gray-700 mb-1">
                  Controller Type
                </label>
                <select
                  id="controllerType"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  value={machineParams.controllerType}
                  onChange={(e) => handleMachineParamChange('controllerType', e.target.value)}
                >
                  <option value="Fanuc 0i">Fanuc 0i</option>
                  <option value="Fanuc 30i">Fanuc 30i</option>
                  <option value="Fanuc 31i">Fanuc 31i</option>
                  <option value="Fanuc 0i-MF">Fanuc 0i-MF</option>
                  <option value="Fanuc 31i-B">Fanuc 31i-B</option>
                </select>
              </div>
              
              {/* Program Number */}
              <div>
                <label htmlFor="programNumber" className="block text-sm font-medium text-gray-700 mb-1">
                  Program Number
                </label>
                <input
                  type="text"
                  id="programNumber"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  value={machineParams.programNumber}
                  onChange={(e) => handleMachineParamChange('programNumber', e.target.value)}
                />
              </div>
              
              {/* Work Offset */}
              <div>
                <label htmlFor="workOffset" className="block text-sm font-medium text-gray-700 mb-1">
                  Work Offset
                </label>
                <select
                  id="workOffset"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  value={machineParams.workOffset}
                  onChange={(e) => handleMachineParamChange('workOffset', e.target.value)}
                >
                  <option value="G54">G54</option>
                  <option value="G55">G55</option>
                  <option value="G56">G56</option>
                  <option value="G57">G57</option>
                  <option value="G58">G58</option>
                  <option value="G59">G59</option>
                </select>
              </div>
              
              {/* Feedrate Mode */}
              <div>
                <label htmlFor="feedrateMode" className="block text-sm font-medium text-gray-700 mb-1">
                  Feedrate Mode
                </label>
                <select
                  id="feedrateMode"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  value={machineParams.feedrateMode}
                  onChange={(e) => handleMachineParamChange('feedrateMode', e.target.value as 'per-minute' | 'per-revolution')}
                >
                  <option value="per-minute">Per Minute (G94)</option>
                  <option value="per-revolution">Per Revolution (G95)</option>
                </select>
              </div>
              
              {/* Cutting Mode */}
              <div>
                <label htmlFor="cuttingMode" className="block text-sm font-medium text-gray-700 mb-1">
                  Cutting Mode
                </label>
                <select
                  id="cuttingMode"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  value={machineParams.cuttingMode}
                  onChange={(e) => handleMachineParamChange('cuttingMode', e.target.value as 'G64' | 'G61' | 'G61.1')}
                >
                  <option value="G64">G64 (Continuous Path)</option>
                  <option value="G61">G61 (Exact Stop)</option>
                  <option value="G61.1">G61.1 (Exact Stop Modal)</option>
                </select>
              </div>
              
              {/* Max Feedrate */}
              <div>
                <label htmlFor="maxFeedrate" className="block text-sm font-medium text-gray-700 mb-1">
                  Max Feedrate (mm/min)
                </label>
                <input
                  type="number"
                  id="maxFeedrate"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  value={machineParams.maxFeedrate}
                  onChange={(e) => handleMachineParamChange('maxFeedrate', Number(e.target.value))}
                />
              </div>
              
              {/* Max Spindle Speed */}
              <div>
                <label htmlFor="maxSpindleSpeed" className="block text-sm font-medium text-gray-700 mb-1">
                  Max Spindle Speed (RPM)
                </label>
                <input
                  type="number"
                  id="maxSpindleSpeed"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  value={machineParams.maxSpindleSpeed}
                  onChange={(e) => handleMachineParamChange('maxSpindleSpeed', Number(e.target.value))}
                />
              </div>
              
              {/* Block Number Increment */}
              <div>
                <label htmlFor="blockNumberIncrement" className="block text-sm font-medium text-gray-700 mb-1">
                  Block Number Increment
                </label>
                <input
                  type="number"
                  id="blockNumberIncrement"
                  min="0"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  value={machineParams.blockNumberIncrement}
                  onChange={(e) => handleMachineParamChange('blockNumberIncrement', Number(e.target.value))}
                />
                <p className="mt-1 text-xs text-gray-500">Set to 0 to disable block numbering</p>
              </div>
              
              {/* Optimization Level */}
              <div>
                <label htmlFor="optimizationLevel" className="block text-sm font-medium text-gray-700 mb-1">
                  Optimization Level
                </label>
                <select
                  id="optimizationLevel"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  value={machineParams.optimizationLevel}
                  onChange={(e) => handleMachineParamChange('optimizationLevel', e.target.value as 'none' | 'basic' | 'advanced')}
                >
                  <option value="none">None</option>
                  <option value="basic">Basic</option>
                  <option value="advanced">Advanced</option>
                </select>
              </div>
            </div>
            
            {/* Advanced Features */}
            <h3 className="text-md font-medium text-gray-900 mt-6 mb-3">Advanced Features</h3>
            <div className="space-y-3">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="highSpeedMode"
                  checked={machineParams.highSpeedMode}
                  onChange={(e) => handleMachineParamChange('highSpeedMode', e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="highSpeedMode" className="ml-2 block text-sm text-gray-900">
                  High Speed Mode (G05.1 Q1)
                </label>
              </div>
              
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="nanoSmoothing"
                  checked={machineParams.nanoSmoothing}
                  onChange={(e) => handleMachineParamChange('nanoSmoothing', e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="nanoSmoothing" className="ml-2 block text-sm text-gray-900">
                  Nano Smoothing (G05.1 Q3)
                </label>
              </div>
              
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="useAICC"
                  checked={machineParams.useAICC}
                  onChange={(e) => handleMachineParamChange('useAICC', e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="useAICC" className="ml-2 block text-sm text-gray-900">
                  AI Contour Control
                </label>
              </div>
              
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="useDecimalPoint"
                  checked={machineParams.useDecimalPoint}
                  onChange={(e) => handleMachineParamChange('useDecimalPoint', e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="useDecimalPoint" className="ml-2 block text-sm text-gray-900">
                  Use Decimal Point
                </label>
              </div>
              
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="simulationValidation"
                  checked={machineParams.simulationValidation}
                  onChange={(e) => handleMachineParamChange('simulationValidation', e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="simulationValidation" className="ml-2 block text-sm text-gray-900">
                  Enable Simulation Validation
                </label>
              </div>
            </div>
            
            {/* Coolant Options */}
            <h3 className="text-md font-medium text-gray-900 mt-6 mb-3">Coolant Options</h3>
            <div className="space-y-3">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="floodCoolant"
                  checked={machineParams.coolantOptions.flood}
                  onChange={(e) => handleCoolantOptionChange('flood', e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="floodCoolant" className="ml-2 block text-sm text-gray-900">
                  Flood Coolant (M8)
                </label>
              </div>
              
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="mistCoolant"
                  checked={machineParams.coolantOptions.mist}
                  onChange={(e) => handleCoolantOptionChange('mist', e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="mistCoolant" className="ml-2 block text-sm text-gray-900">
                  Mist Coolant (M7)
                </label>
              </div>
              
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="throughCoolant"
                  checked={machineParams.coolantOptions.through}
                  onChange={(e) => handleCoolantOptionChange('through', e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="throughCoolant" className="ml-2 block text-sm text-gray-900">
                  Through Tool Coolant
                </label>
              </div>
            </div>
            
            {/* Submit Button */}
            <div className="mt-6 flex justify-end">
              <button
                onClick={handleProcessGcode}
                disabled={isProcessing || !inputGcode.trim()}
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 disabled:opacity-50"
              >
                {isProcessing ? 'Processing...' : 'Apply Settings & Process G-code'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FanucPostProcessor;
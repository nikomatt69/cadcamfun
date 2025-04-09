import React, { useState, useEffect } from 'react';

interface HeidenhainPostProcessorProps {
  initialGcode?: string;
  onProcessedGcode?: (gcode: string, validationResults?: any) => void;
}

interface HeidenhainMachineParameters {
  controllerType: 'TNC 640' | 'TNC 620' | 'TNC 320' | 'iTNC 530' | 'TNC 128';
  useConversationalFormat: boolean;
  useSubPrograms: boolean;
  useParametricProgramming: boolean;
  useCycles: boolean;
  useToolRadiusCompensation: boolean;
  maxRapidFeedrate: number;
  maxSpindleSpeed: number;
  programSafety: {
    useWorkingPlaneMonitoring: boolean;
    useToolMonitoring: boolean;
    useAdvancedDynamics: boolean;
  };
  blockNumberIncrement: number;
  formatSettings: {
    useMM: boolean;
    useDecimalPoint: boolean;
    spaceAfterAddress: boolean;
    useEndOfLineComment: boolean;
  };
}

const defaultMachineParameters: HeidenhainMachineParameters = {
  controllerType: 'TNC 640',
  useConversationalFormat: true,
  useSubPrograms: false,
  useParametricProgramming: false,
  useCycles: true,
  useToolRadiusCompensation: true,
  maxRapidFeedrate: 30000,
  maxSpindleSpeed: 24000,
  programSafety: {
    useWorkingPlaneMonitoring: true,
    useToolMonitoring: true,
    useAdvancedDynamics: false,
  },
  blockNumberIncrement: 5,
  formatSettings: {
    useMM: true,
    useDecimalPoint: true,
    spaceAfterAddress: true,
    useEndOfLineComment: true,
  }
};

const HeidenhainPostProcessor: React.FC<HeidenhainPostProcessorProps> = ({ 
  initialGcode = '', 
  onProcessedGcode 
}) => {
  const [inputGcode, setInputGcode] = useState(initialGcode);
  const [outputGcode, setOutputGcode] = useState('');
  const [machineParams, setMachineParams] = useState<HeidenhainMachineParameters>(defaultMachineParameters);
  const [validationResults, setValidationResults] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState<'input' | 'output' | 'validation' | 'settings'>('input');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setInputGcode(initialGcode);
  }, [initialGcode]);

  const handleProcessGcode = async () => {
    setIsProcessing(true);
    setErrorMessage(null);
    
    try {
      // Simuliamo la post-elaborazione del codice
      let processed = applyHeidenhainPostProcessing(inputGcode, machineParams);
      
      // Simuliamo la validazione
      const validationResult = validateHeidenhainCode(processed, machineParams);
      
      setOutputGcode(processed);
      setValidationResults(validationResult);
      
      if (onProcessedGcode) {
        onProcessedGcode(processed, validationResult);
      }
      
      // Passa alla scheda di output dopo l'elaborazione
      setActiveTab('output');
    } catch (error) {
      console.error('Error processing G-code:', error);
      setErrorMessage(`Error processing G-code: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const applyHeidenhainPostProcessing = (gcode: string, params: HeidenhainMachineParameters): string => {
    // Questa è una versione semplificata di un post-processore Heidenhain
    let processedGcode = '';
    
    // Intestazione del programma Heidenhain
    processedGcode += `BEGIN PGM EXAMPLE MM\n`;
    
    // Converti le unità se necessario
    if (params.formatSettings.useMM) {
      processedGcode += `UNIT MM\n`;
    } else {
      processedGcode += `UNIT INCH\n`;
    }
    
    // Imposta il blocco iniziale con le impostazioni di sicurezza
    processedGcode += `BLK FORM 0.1 Z X+0 Y+0 Z-50\n`;
    processedGcode += `BLK FORM 0.2 X+100 Y+100 Z+0\n`;
    
    // Impostazioni di sicurezza
    if (params.programSafety.useWorkingPlaneMonitoring) {
      processedGcode += `FUNCTION TCPM F TCP AXIS POS PATHCTRL AXIS\n`;
    }
    
    if (params.programSafety.useToolMonitoring) {
      processedGcode += `TOOL CALL 1 Z S${params.maxSpindleSpeed} F${params.maxRapidFeedrate}\n`;
    }
    
    // Adatta il G-code in formato Heidenhain
    const lines = gcode.split('\n');
    let blockNumber = 10;
    
    for (const line of lines) {
      if (line.trim() === '' || line.trim().startsWith('(') || line.trim().startsWith('%')) {
        // Converti i commenti nel formato Heidenhain
        if (line.trim().startsWith('(')) {
          const comment = line.trim().substring(1, line.trim().length - 1);
          processedGcode += params.formatSettings.useEndOfLineComment ? 
            `; ${comment}\n` : `${blockNumber} ; ${comment}\n`;
          blockNumber += params.blockNumberIncrement;
        } else {
          processedGcode += line + '\n';
        }
        continue;
      }
      
      // Elaborazione delle linee di codice
      
      // Converti il G0 (rapido) in un formato Heidenhain
      if (line.includes('G0')) {
        const xMatch = line.match(/X(-?[\d.]+)/);
        const yMatch = line.match(/Y(-?[\d.]+)/);
        const zMatch = line.match(/Z(-?[\d.]+)/);
        
        let heidenhainLine = `${blockNumber} L `;
        if (xMatch) heidenhainLine += `X+${parseFloat(xMatch[1])} `;
        if (yMatch) heidenhainLine += `Y+${parseFloat(yMatch[1])} `;
        if (zMatch) heidenhainLine += `Z+${parseFloat(zMatch[1])} `;
        heidenhainLine += `FMAX`;
        
        processedGcode += heidenhainLine + '\n';
        blockNumber += params.blockNumberIncrement;
      }
      // Converti il G1 (movimento lineare) in formato Heidenhain
      else if (line.includes('G1')) {
        const xMatch = line.match(/X(-?[\d.]+)/);
        const yMatch = line.match(/Y(-?[\d.]+)/);
        const zMatch = line.match(/Z(-?[\d.]+)/);
        const fMatch = line.match(/F([\d.]+)/);
        
        let heidenhainLine = `${blockNumber} L `;
        if (xMatch) heidenhainLine += `X+${parseFloat(xMatch[1])} `;
        if (yMatch) heidenhainLine += `Y+${parseFloat(yMatch[1])} `;
        if (zMatch) heidenhainLine += `Z+${parseFloat(zMatch[1])} `;
        if (fMatch) heidenhainLine += `F${parseFloat(fMatch[1])}`;
        
        processedGcode += heidenhainLine + '\n';
        blockNumber += params.blockNumberIncrement;
      }
      // Converti il G2/G3 (archi) in formato Heidenhain
      else if (line.includes('G2') || line.includes('G3')) {
        const isClockwise = line.includes('G2');
        const xMatch = line.match(/X(-?[\d.]+)/);
        const yMatch = line.match(/Y(-?[\d.]+)/);
        const iMatch = line.match(/I(-?[\d.]+)/);
        const jMatch = line.match(/J(-?[\d.]+)/);
        const fMatch = line.match(/F([\d.]+)/);
        
        let heidenhainLine = `${blockNumber} ${isClockwise ? 'CR' : 'CT'} `;
        if (xMatch) heidenhainLine += `X+${parseFloat(xMatch[1])} `;
        if (yMatch) heidenhainLine += `Y+${parseFloat(yMatch[1])} `;
        if (iMatch && jMatch) {
          // Nel formato Heidenhain, il raggio è specificato in modo diverso
          const radius = Math.sqrt(
            Math.pow(parseFloat(iMatch[1]), 2) + 
            Math.pow(parseFloat(jMatch[1]), 2)
          );
          heidenhainLine += `R+${radius.toFixed(3)} `;
        }
        if (fMatch) heidenhainLine += `F${parseFloat(fMatch[1])}`;
        
        processedGcode += heidenhainLine + '\n';
        blockNumber += params.blockNumberIncrement;
      }
      // Gestisci i cambi utensile
      else if (line.includes('T') && line.includes('M6')) {
        const toolMatch = line.match(/T(\d+)/);
        if (toolMatch) {
          processedGcode += `${blockNumber} TOOL CALL ${toolMatch[1]} Z\n`;
          blockNumber += params.blockNumberIncrement;
        }
      }
      // Gestisci gli avvii mandrino
      else if (line.includes('M3') || line.includes('M4')) {
        const isClockwise = line.includes('M3');
        const sMatch = line.match(/S([\d.]+)/);
        if (sMatch) {
          processedGcode += `${blockNumber} ${isClockwise ? 'M3' : 'M4'} S${parseFloat(sMatch[1])}\n`;
          blockNumber += params.blockNumberIncrement;
        }
      }
      // Gestisci le compensazioni utensile
      else if (line.includes('G41') || line.includes('G42')) {
        const isLeft = line.includes('G41');
        processedGcode += `${blockNumber} ${isLeft ? 'RL' : 'RR'}\n`;
        blockNumber += params.blockNumberIncrement;
      }
      // Gestisci le cancellazioni di compensazione
      else if (line.includes('G40')) {
        processedGcode += `${blockNumber} R0\n`;
        blockNumber += params.blockNumberIncrement;
      }
      // Gestisci la fine del programma
      else if (line.includes('M30')) {
        processedGcode += `${blockNumber} END PGM EXAMPLE MM\n`;
        blockNumber += params.blockNumberIncrement;
      }
      // Altri codici G/M
      else {
        // Per altri codici, includiamo la linea originale come commento e una versione Heidenhain se possibile
        processedGcode += `${blockNumber} ; Original: ${line}\n`;
        blockNumber += params.blockNumberIncrement;
      }
    }
    
    // Assicurati che il programma termini correttamente
    if (!processedGcode.includes('END PGM')) {
      processedGcode += `${blockNumber} END PGM EXAMPLE MM\n`;
    }
    
    return processedGcode;
  };

  const validateHeidenhainCode = (code: string, params: HeidenhainMachineParameters): any => {
    // Simuliamo una semplice validazione
    const validationResults = {
      isValid: true,
      warnings: [] as string[],
      errors: [] as string[],
      statistics: {
        totalBlocks: 0,
        totalLinearMoves: 0,
        totalArcMoves: 0,
        toolChanges: 0,
        estimatedMachiningTime: 0
      }
    };
    
    const lines = code.split('\n');
    let linearMoves = 0;
    let arcMoves = 0;
    let toolChanges = 0;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Conta i blocchi non vuoti e non commentati
      if (line !== '' && !line.startsWith(';')) {
        validationResults.statistics.totalBlocks++;
      }
      
      // Conta i movimenti lineari
      if (line.includes('L ') && (line.includes('X') || line.includes('Y') || line.includes('Z'))) {
        linearMoves++;
        
        // Controlla se la velocità di avanzamento è troppo alta
        const fMatch = line.match(/F(\d+)/);
        if (fMatch && parseInt(fMatch[1]) > params.maxRapidFeedrate) {
          validationResults.warnings.push(`Line ${i+1}: Feedrate ${fMatch[1]} exceeds maximum ${params.maxRapidFeedrate}`);
        }
      }
      
      // Conta i movimenti circolari
      if (line.includes('CR ') || line.includes('CT ')) {
        arcMoves++;
      }
      
      // Conta i cambi utensile
      if (line.includes('TOOL CALL')) {
        toolChanges++;
      }
      
      // Verifica altre possibili condizioni di errore
      if (!line.startsWith('END PGM') && line.includes('END PGM')) {
        validationResults.errors.push(`Line ${i+1}: END PGM must be at the beginning of a block`);
        validationResults.isValid = false;
      }
    }
    
    // Aggiorna le statistiche
    validationResults.statistics.totalLinearMoves = linearMoves;
    validationResults.statistics.totalArcMoves = arcMoves;
    validationResults.statistics.toolChanges = toolChanges;
    
    // Stima il tempo di lavorazione (molto approssimativo)
    validationResults.statistics.estimatedMachiningTime = 
      (linearMoves * 2) + (arcMoves * 3) + (toolChanges * 10);
    
    return validationResults;
  };

  const handleMachineParamChange = (key: keyof HeidenhainMachineParameters, value: any) => {
    setMachineParams(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleFormatSettingChange = (key: keyof HeidenhainMachineParameters['formatSettings'], value: boolean) => {
    setMachineParams(prev => ({
      ...prev,
      formatSettings: {
        ...prev.formatSettings,
        [key]: value
      }
    }));
  };

  const handleProgramSafetyChange = (key: keyof HeidenhainMachineParameters['programSafety'], value: boolean) => {
    setMachineParams(prev => ({
      ...prev,
      programSafety: {
        ...prev.programSafety,
        [key]: value
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
        <h2 className="text-lg font-medium text-gray-900">Heidenhain Post-Processor</h2>
        <p className="mt-1 text-sm text-gray-500">
          Ottimizza e converte G-code per controller Heidenhain TNC
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
            Codice Input
          </button>
          <button
            onClick={() => setActiveTab('output')}
            className={`py-3 px-2 border-b-2 text-sm font-medium ${
              activeTab === 'output'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Codice Elaborato
          </button>
          <button
            onClick={() => setActiveTab('validation')}
            className={`py-3 px-2 border-b-2 text-sm font-medium ${
              activeTab === 'validation'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Validazione
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`py-3 px-2 border-b-2 text-sm font-medium ${
              activeTab === 'settings'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Impostazioni
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      <div className="p-4">
        {activeTab === 'input' && (
          <div>
            <div className="mb-4">
              <label htmlFor="inputGcode" className="block text-sm font-medium text-gray-700 mb-1">
                Codice G-code di input
              </label>
              <textarea
                id="inputGcode"
                rows={15}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                value={inputGcode}
                onChange={handleInputChange}
                placeholder="Incolla qui il tuo G-code standard..."
              />
            </div>
            <div className="flex justify-end">
              <button
                onClick={handleProcessGcode}
                disabled={isProcessing || !inputGcode.trim()}
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 disabled:opacity-50"
              >
                {isProcessing ? 'Elaborazione...' : 'Elabora G-code'}
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
                Codice Heidenhain elaborato
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
                  a.download = 'heidenhain_code.h';
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                }}
                disabled={!outputGcode}
                className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50 disabled:opacity-50"
              >
                Scarica
              </button>
              <button
                onClick={() => navigator.clipboard.writeText(outputGcode)}
                disabled={!outputGcode}
                className="bg-gray-500 text-white px-4 py-2 rounded-md hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-opacity-50 disabled:opacity-50"
              >
                Copia negli Appunti
              </button>
            </div>
          </div>
        )}

        {activeTab === 'validation' && (
          <div>
            <h3 className="text-md font-medium text-gray-900 mb-3">Risultati Validazione</h3>
            
            {validationResults ? (
              <div>
                <div className={`p-3 rounded-md mb-4 border ${
                  validationResults.isValid 
                    ? 'text-green-700 bg-green-50 border-green-200' 
                    : 'text-red-700 bg-red-50 border-red-200'
                }`}>
                  <p className="font-medium">
                    {validationResults.isValid 
                      ? 'Validazione Codice Superata' 
                      : 'Validazione Codice Fallita'}
                  </p>
                </div>
                
                {validationResults.errors && validationResults.errors.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Errori:</h4>
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
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Avvisi:</h4>
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
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Statistiche:</h4>
                    <div className="bg-gray-50 p-3 rounded-md border border-gray-200">
                      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                        <dt className="text-gray-500">Blocchi totali:</dt>
                        <dd className="text-gray-900">{validationResults.statistics.totalBlocks}</dd>
                        
                        <dt className="text-gray-500">Movimenti lineari:</dt>
                        <dd className="text-gray-900">{validationResults.statistics.totalLinearMoves}</dd>
                        
                        <dt className="text-gray-500">Movimenti ad arco:</dt>
                        <dd className="text-gray-900">{validationResults.statistics.totalArcMoves}</dd>
                        
                        <dt className="text-gray-500">Cambi utensile:</dt>
                        <dd className="text-gray-900">{validationResults.statistics.toolChanges}</dd>
                        
                        <dt className="text-gray-500">Tempo stimato:</dt>
                        <dd className="text-gray-900">{(validationResults.statistics.estimatedMachiningTime / 60).toFixed(2)} min</dd>
                      </dl>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 text-center text-gray-500 bg-gray-50 rounded-md border border-gray-200">
                <p>Nessun risultato di validazione disponibile. Elabora prima il G-code.</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'settings' && (
          <div>
            <h3 className="text-md font-medium text-gray-900 mb-3">Impostazioni Controller</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Controller Type */}
              <div>
                <label htmlFor="controllerType" className="block text-sm font-medium text-gray-700 mb-1">
                  Tipo di Controller
                </label>
                <select
                  id="controllerType"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  value={machineParams.controllerType}
                  onChange={(e) => handleMachineParamChange('controllerType', e.target.value)}
                >
                  <option value="TNC 640">Heidenhain TNC 640</option>
                  <option value="TNC 620">Heidenhain TNC 620</option>
                  <option value="TNC 320">Heidenhain TNC 320</option>
                  <option value="iTNC 530">Heidenhain iTNC 530</option>
                  <option value="TNC 128">Heidenhain TNC 128</option>
                </select>
              </div>
              
              {/* Block Number Increment */}
              <div>
                <label htmlFor="blockNumberIncrement" className="block text-sm font-medium text-gray-700 mb-1">
                  Incremento Numeri di Blocco
                </label>
                <input
                  type="number"
                  id="blockNumberIncrement"
                  min="0"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  value={machineParams.blockNumberIncrement}
                  onChange={(e) => handleMachineParamChange('blockNumberIncrement', Number(e.target.value))}
                />
                <p className="mt-1 text-xs text-gray-500">Impostare a 0 per disabilitare la numerazione dei blocchi</p>
              </div>
              
              {/* Max Feedrate */}
              <div>
                <label htmlFor="maxRapidFeedrate" className="block text-sm font-medium text-gray-700 mb-1">
                  Velocità Max Rapidi (mm/min)
                </label>
                <input
                  type="number"
                  id="maxRapidFeedrate"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  value={machineParams.maxRapidFeedrate}
                  onChange={(e) => handleMachineParamChange('maxRapidFeedrate', Number(e.target.value))}
                />
              </div>
              
              {/* Max Spindle Speed */}
              <div>
                <label htmlFor="maxSpindleSpeed" className="block text-sm font-medium text-gray-700 mb-1">
                  Velocità Max Mandrino (RPM)
                </label>
                <input
                  type="number"
                  id="maxSpindleSpeed"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  value={machineParams.maxSpindleSpeed}
                  onChange={(e) => handleMachineParamChange('maxSpindleSpeed', Number(e.target.value))}
                />
              </div>
            </div>
            
            {/* Format Settings */}
            <h3 className="text-md font-medium text-gray-900 mt-6 mb-3">Impostazioni Formato</h3>
            <div className="space-y-3">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="useMM"
                  checked={machineParams.formatSettings.useMM}
                  onChange={(e) => handleFormatSettingChange('useMM', e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="useMM" className="ml-2 block text-sm text-gray-900">
                  Usa millimetri (MM) invece di pollici
                </label>
              </div>
              
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="useDecimalPoint"
                  checked={machineParams.formatSettings.useDecimalPoint}
                  onChange={(e) => handleFormatSettingChange('useDecimalPoint', e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="useDecimalPoint" className="ml-2 block text-sm text-gray-900">
                  Usa punto decimale
                </label>
              </div>
              
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="spaceAfterAddress"
                  checked={machineParams.formatSettings.spaceAfterAddress}
                  onChange={(e) => handleFormatSettingChange('spaceAfterAddress', e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="spaceAfterAddress" className="ml-2 block text-sm text-gray-900">
                  Inserisci spazio dopo gli indirizzi (es. &quot;X 10&quot; invece di &quot;X10&quot;)
                </label>
              </div>
              
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="useEndOfLineComment"
                  checked={machineParams.formatSettings.useEndOfLineComment}
                  onChange={(e) => handleFormatSettingChange('useEndOfLineComment', e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="useEndOfLineComment" className="ml-2 block text-sm text-gray-900">
                  Usa commenti a fine riga invece che su righe separate
                </label>
              </div>
            </div>
            
            {/* Programming Options */}
            <h3 className="text-md font-medium text-gray-900 mt-6 mb-3">Opzioni di Programmazione</h3>
            <div className="space-y-3">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="useConversationalFormat"
                  checked={machineParams.useConversationalFormat}
                  onChange={(e) => handleMachineParamChange('useConversationalFormat', e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="useConversationalFormat" className="ml-2 block text-sm text-gray-900">
                  Usa formato conversazionale Heidenhain (consigliato)
                </label>
              </div>
              
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="useCycles"
                  checked={machineParams.useCycles}
                  onChange={(e) => handleMachineParamChange('useCycles', e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="useCycles" className="ml-2 block text-sm text-gray-900">
                  Usa cicli Heidenhain quando possibile
                </label>
              </div>
              
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="useToolRadiusCompensation"
                  checked={machineParams.useToolRadiusCompensation}
                  onChange={(e) => handleMachineParamChange('useToolRadiusCompensation', e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="useToolRadiusCompensation" className="ml-2 block text-sm text-gray-900">
                  Usa compensazione raggio utensile (RR/RL)
                </label>
              </div>
              
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="useSubPrograms"
                  checked={machineParams.useSubPrograms}
                  onChange={(e) => handleMachineParamChange('useSubPrograms', e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="useSubPrograms" className="ml-2 block text-sm text-gray-900">
                  Genera sottoprogrammi per le operazioni ripetute
                </label>
              </div>
              
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="useParametricProgramming"
                  checked={machineParams.useParametricProgramming}
                  onChange={(e) => handleMachineParamChange('useParametricProgramming', e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="useParametricProgramming" className="ml-2 block text-sm text-gray-900">
                  Usa programmazione parametrica (variabili Q)
                </label>
              </div>
            </div>
            
            {/* Safety Features */}
            <h3 className="text-md font-medium text-gray-900 mt-6 mb-3">Funzionalità di Sicurezza</h3>
            <div className="space-y-3">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="useWorkingPlaneMonitoring"
                  checked={machineParams.programSafety.useWorkingPlaneMonitoring}
                  onChange={(e) => handleProgramSafetyChange('useWorkingPlaneMonitoring', e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="useWorkingPlaneMonitoring" className="ml-2 block text-sm text-gray-900">
                  Usa monitoraggio piano di lavoro (TCPM)
                </label>
              </div>
              
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="useToolMonitoring"
                  checked={machineParams.programSafety.useToolMonitoring}
                  onChange={(e) => handleProgramSafetyChange('useToolMonitoring', e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="useToolMonitoring" className="ml-2 block text-sm text-gray-900">
                  Usa monitoraggio utensile
                </label>
              </div>
              
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="useAdvancedDynamics"
                  checked={machineParams.programSafety.useAdvancedDynamics}
                  onChange={(e) => handleProgramSafetyChange('useAdvancedDynamics', e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="useAdvancedDynamics" className="ml-2 block text-sm text-gray-900">
                  Usa controllo avanzato della dinamica
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
                {isProcessing ? 'Elaborazione...' : 'Applica Impostazioni ed Elabora G-code'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default HeidenhainPostProcessor;
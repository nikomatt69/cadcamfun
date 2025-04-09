// src/components/cam/GCodeEditor.tsx
import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, ChevronLeft, ChevronRight, Plus, Minus, AlertTriangle, ChevronUp, Cpu } from 'react-feather';
import AIOptimizer from './AIOptimizer';

import AIEnhancedEditor from './AIEnhancedEditor';

import axios from 'axios';
import GCodeContextMenu from './GCodeContextMenu';

interface GCodeEditorProps {
  height: string;
  value: string;
  onChange: (code: string) => void;
}

const GCodeEditor: React.FC<GCodeEditorProps> = ({ height, value, onChange }) => {
  const [lines, setLines] = useState<string[]>([]);
  const [currentLine, setCurrentLine] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playSpeed, setPlaySpeed] = useState<number>(1);
  const [highlight, setHighlight] = useState<{ line: number; color: string } | null>(null);
  const [showScrollTop, setShowScrollTop] = useState<boolean>(false);
  const [aiInsights, setAiInsights] = useState<string | null>(null);
  const [isAnalyzingToolpath, setIsAnalyzingToolpath] = useState<boolean>(false);
  
  // Context menu states for right-click functionality
  const [contextMenu, setContextMenu] = useState({
    visible: false,
    position: { x: 0, y: 0 },
    selectedCode: ''
  });
  
  // Riferimenti ai componenti principali per lo scroll
  const mainContainerRef = useRef<HTMLDivElement>(null);
  const codeViewerRef = useRef<HTMLDivElement>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const lastAnalyzedCodeRef = useRef<string>('');
  
  useEffect(() => {
    if (value) {
      const splitLines = value.split('\n').filter(line => line.trim());
      setLines(splitLines);
      setCurrentLine(0);
      
      // Check if code has changed significantly since last analysis
      if (!lastAnalyzedCodeRef.current || 
          Math.abs(value.length - lastAnalyzedCodeRef.current.length) > 200) {
        // Analyze the toolpath with AI
        analyzeToolpath(value);
        lastAnalyzedCodeRef.current = value;
      }
    } else {
      setLines([]);
    }
  }, [value]);

  useEffect(() => {
    // Gestione dell'evento di scroll per mostrare/nascondere il pulsante "torna su"
    const handleScroll = () => {
      if (mainContainerRef.current) {
        setShowScrollTop(mainContainerRef.current.scrollTop > 300);
      }
    };

    const mainContainer = mainContainerRef.current;
    if (mainContainer) {
      mainContainer.addEventListener('scroll', handleScroll);
    }

    return () => {
      if (mainContainer) {
        mainContainer.removeEventListener('scroll', handleScroll);
      }
    };
  }, []);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    
    if (isPlaying && lines.length > 0) {
      timer = setTimeout(() => {
        if (currentLine < lines.length - 1) {
          setCurrentLine(prev => prev + 1);
          
          // Parse line for specific commands that might need visualization
          parseCurrentLine(lines[currentLine]);
          
          // Auto-scroll alla linea corrente
          scrollToCurrentLine();
        } else {
          setIsPlaying(false);
        }
      }, 1000 / playSpeed);
    }
    
    return () => {
      if (timer) clearTimeout(timer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, currentLine, lines, playSpeed]);

  // Analyze toolpath with Claude AI
  const analyzeToolpath = async (gcode: string) => {
    if (!gcode || gcode.length < 50) return;
    
    setIsAnalyzingToolpath(true);
    
    try {
      // Call Claude API through a proxy endpoint
      const response = await axios.post('/api/ai/toolpath-analysis', {
        gcode,
        model: 'claude-3-5-sonnet-20240229',
        max_tokens: 300
      });
      
      setAiInsights(response.data.insights);
    } catch (error) {
      console.error('Error analyzing toolpath:', error);
      setAiInsights(null);
    } finally {
      setIsAnalyzingToolpath(false);
    }
  };

  const parseCurrentLine = (line: string) => {
    // Reset highlight
    setHighlight(null);
    
    // Check if the line has a G or M code
    if (line.includes('G') || line.includes('M')) {
      // Highlight G-code commands
      if (line.includes('G0') || line.includes('G00')) {
        setHighlight({ line: currentLine, color: 'bg-blue-100' }); // Rapid movement
      } else if (line.includes('G1') || line.includes('G01')) {
        setHighlight({ line: currentLine, color: 'bg-green-100' }); // Linear movement
      } else if (line.match(/G2|G02|G3|G03/)) {
        setHighlight({ line: currentLine, color: 'bg-purple-100' }); // Circular movement
      } else if (line.includes('M') && !line.match(/^\s*;/)) {
        setHighlight({ line: currentLine, color: 'bg-yellow-100' }); // Machine functions
      }
    }
  };

  const handleTextChange = (newText: string) => {
    onChange(newText);
  };

  const handleApplyOptimized = (optimizedCode: string) => {
    onChange(optimizedCode);
  };

  const togglePlay = () => {
    setIsPlaying(!isPlaying);
  };

  const nextLine = () => {
    if (currentLine < lines.length - 1) {
      setCurrentLine(currentLine + 1);
      parseCurrentLine(lines[currentLine + 1]);
      scrollToCurrentLine();
    }
  };

  const prevLine = () => {
    if (currentLine > 0) {
      setCurrentLine(currentLine - 1);
      parseCurrentLine(lines[currentLine - 1]);
      scrollToCurrentLine();
    }
  };

  const increaseSpeed = () => {
    if (playSpeed < 10) {
      setPlaySpeed(prev => prev + 0.5);
    }
  };

  const decreaseSpeed = () => {
    if (playSpeed > 0.5) {
      setPlaySpeed(prev => prev - 0.5);
    }
  };

  // Function to handle right-click in the editor or code viewer
  const handleContextMenu = (event: React.MouseEvent, code?: string) => {
    event.preventDefault();
    
    let selectedCode = code || '';
    
    // If no code is provided directly, try to get the selection from the browser
    if (!selectedCode) {
      const selection = window.getSelection();
      if (selection && selection.toString().trim()) {
        selectedCode = selection.toString();
      }
    }
    
    // Only show context menu if there's selected code
    if (selectedCode.trim()) {
      setContextMenu({
        visible: true,
        position: { x: event.clientX, y: event.clientY },
        selectedCode
      });
    }
  };
  
  // Close the context menu
  const closeContextMenu = () => {
    setContextMenu({
      ...contextMenu,
      visible: false
    });
  };

  // Funzione per scorrere alla linea corrente
  const scrollToCurrentLine = () => {
    if (codeViewerRef.current) {
      const tableRows = codeViewerRef.current.querySelectorAll('tr');
      if (tableRows[currentLine]) {
        tableRows[currentLine].scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  };
  
  const handleApplySuggestion = (updatedCode: string) => {
    onChange(updatedCode);
  };

  // Funzione per tornare all'inizio della pagina
  const scrollToTop = () => {
    if (mainContainerRef.current) {
      mainContainerRef.current.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    }
  };

  // Analisi G-code
  const rapidMoves = lines.filter(line => line.includes('G0') || line.includes('G00')).length;
  const linearMoves = lines.filter(line => line.includes('G1') || line.includes('G01')).length;
  const circularMoves = lines.filter(line => line.match(/G2|G02|G3|G03/)).length;
  const machineFunctions = lines.filter(line => line.includes('M') && !line.match(/^\s*;/)).length;

  // Check if it's Fanuc G-code
  const isFanucGCode = lines.some(line => 
    line.includes('%') || 
    line.includes('O') || 
    line.match(/N\d+/) ||
    line.includes('M30')
  );

  return (
    <div 
      ref={mainContainerRef}
      className="h-full flex flex-col pt-0.5 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent"
      style={{ maxHeight: height || '800px' }}
      onContextMenu={(e) => handleContextMenu(e)}
    >
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Input Area */}
        <div className="lg:col-span-2">
          <div className="bg-gray-100 shadow-md rounded-md p-4 h-full flex flex-col">
              <h2 className="text-lg font-medium text-gray-900 mb-3">G-Code Editor</h2>
            
            {/* Editor avanzato invece di textarea */}
            <div 
              className="mb-4 rounded-xl m-2 flex-1"
              ref={editorContainerRef}
              onContextMenu={(e) => handleContextMenu(e)}
            >
              <AIEnhancedEditor
                value={value}
                onChange={handleTextChange}
                language="gcode"
              />
            </div>
          </div>
        </div>
          
        {/* Visualization Area */}
        <div className="lg:col-span-1">
          <div className="bg-white shadow-md rounded-md p-4 h-full flex flex-col">
            <h2 className="text-lg font-medium text-gray-900 mb-3">Execution Preview</h2>
            
            {lines.length > 0 ? (
              <>
                <div 
                  ref={codeViewerRef}
                  className="mb-4 flex-1 overflow-y-auto border border-gray-200 rounded-md font-mono scrollbar-thin scrollbar-thumb-blue-300 scrollbar-track-transparent"
                  onContextMenu={(e) => {
                    // Get the closest TR element to find the selected line
                    const trElement = (e.target as HTMLElement).closest('tr');
                    if (trElement) {
                      // Get the code from the second TD (the line content)
                      const codeTd = trElement.querySelector('td:nth-child(2)');
                      if (codeTd) {
                        handleContextMenu(e, codeTd.textContent || '');
                      }
                    }
                  }}
                >
                  <table className="min-w-full divide-y divide-gray-200">
                    <tbody className="bg-white divide-y divide-gray-200">
                      {lines.map((line, idx) => (
                        <tr 
                          key={idx} 
                          className={`${idx === currentLine ? 'bg-yellow-100' : ''} ${
                            highlight?.line === idx ? highlight.color : ''
                          }`}
                          id={`line-${idx}`}
                        >
                          <td className="px-2 py-1 whitespace-nowrap text-xs text-gray-500">
                            {idx + 1}
                          </td>
                          <td className="px-4 py-1 whitespace-nowrap text-sm">
                            {line}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                
                <div className="mt-auto">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={togglePlay}
                        className="p-2 rounded-full bg-blue-600 text-white hover:bg-blue-700 focus:outline-none"
                      >
                        {isPlaying ? <Pause size={18} /> : <Play size={18} />}
                      </button>
                      
                      <button
                        onClick={prevLine}
                        className="p-2 rounded-full bg-gray-200 hover:bg-gray-300 focus:outline-none"
                        disabled={currentLine === 0}
                      >
                        <ChevronLeft size={18} />
                      </button>
                      
                      <button
                        onClick={nextLine}
                        className="p-2 rounded-full bg-gray-200 hover:bg-gray-300 focus:outline-none"
                        disabled={currentLine === lines.length - 1}
                      >
                        <ChevronRight size={18} />
                      </button>
                    </div>
                    
                    <div className="flex items-center">
                      <span className="text-sm text-gray-700 mr-2">Speed: {playSpeed}x</span>
                      <button
                        onClick={decreaseSpeed}
                        className="p-1 rounded-full bg-gray-200 hover:bg-gray-300 focus:outline-none"
                        disabled={playSpeed <= 0.5}
                      >
                        <Minus size={14} />
                      </button>
                      
                      <button
                        onClick={increaseSpeed}
                        className="p-1 rounded-full bg-gray-200 hover:bg-gray-300 focus:outline-none ml-1"
                        disabled={playSpeed >= 10}
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                  
                  <div className="p-3 bg-gray-50 rounded-md">
                    <p className="text-sm text-gray-700">
                      Linea {currentLine + 1} di {lines.length}: <span className="font-mono">{lines[currentLine] || ""}</span>
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full border border-gray-200 rounded-md">
                <p className="text-gray-500 mb-4">No G-Code loaded</p>
                <p className="text-sm text-gray-400">Paste the code in the editor or import a file</p>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* AI Insights Panel */}
      {(aiInsights || isAnalyzingToolpath) && (
        <div className="bg-blue-50 shadow-md rounded-md p-4 mt-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-md font-medium text-blue-800 flex items-center">
              <Cpu size={16} className="mr-2" />
              AI Insights
            </h3>
            {isAnalyzingToolpath && (
              <div className="flex items-center text-blue-600">
                <div className="animate-spin h-3 w-3 mr-2 rounded-full bg-blue-600"></div>
                <span className="text-xs">Analyzing...</span>
              </div>
            )}
          </div>
          <p className="text-sm text-blue-700">
            {aiInsights || "Analyzing your G-code for insights..."}
          </p>
        </div>
      )}
      
      {/* Analisi del codice */}
      <div className="bg-white shadow-md rounded-md p-4 mt-6">
        <h2 className="text-lg font-medium text-gray-900 mb-3">G-Code Analysis</h2>
        
        {lines.length > 0 ? (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-3 bg-gray-50 rounded-md">
                <p className="text-sm font-medium text-gray-700">Total Lines</p>
                <p className="text-2xl font-bold text-blue-600">{lines.length}</p>
              </div>
              
              <div className="p-3 bg-blue-50 rounded-md">
                <p className="text-sm font-medium text-gray-700">Rapid Moves</p>
                <p className="text-2xl font-bold text-blue-600">
                  {rapidMoves}
                </p>
              </div>
              
              <div className="p-3 bg-green-50 rounded-md">
                <p className="text-sm font-medium text-gray-700">Linear Moves</p>
                <p className="text-2xl font-bold text-green-600">
                  {linearMoves}
                </p>
              </div>
              
              <div className="p-3 bg-purple-50 rounded-md">
                <p className="text-sm font-medium text-gray-700">Circular Moves</p>
                <p className="text-2xl font-bold text-purple-600">
                  {circularMoves}
                </p>
              </div>
              
              <div className="p-3 bg-yellow-50 rounded-md lg:col-span-2">
                <p className="text-sm font-medium text-gray-700">Machine Functions</p>
                <p className="text-2xl font-bold text-yellow-600">
                  {machineFunctions}
                </p>
              </div>
              
              <div className="p-3 bg-gray-50 rounded-md lg:col-span-2">
                <p className="text-sm font-medium text-gray-700">Estimated Time</p>
                <p className="text-2xl font-bold text-green-600">
                  {(lines.length / playSpeed / 60).toFixed(2)} min
                </p>
              </div>
            </div>
            
            <div className="mt-4 p-3 bg-gray-50 rounded-md">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Command Legend</h3>
              <div className="flex flex-wrap gap-4">
                <div className="flex items-center">
                  <div className="w-4 h-4 bg-blue-100 mr-1 border border-blue-200"></div>
                  <span className="text-xs">G0/G00 - Rapid Move</span>
                </div>
                <div className="flex items-center">
                  <div className="w-4 h-4 bg-green-100 mr-1 border border-green-200"></div>
                  <span className="text-xs">G1/G01 - Linear Move</span>
                </div>
                <div className="flex items-center">
                  <div className="w-4 h-4 bg-purple-100 mr-1 border border-purple-200"></div>
                  <span className="text-xs">G2/G3 - Circular Move</span>
                </div>
                <div className="flex items-center">
                  <div className="w-4 h-4 bg-yellow-100 mr-1 border border-yellow-200"></div>
                  <span className="text-xs">M Commands - Machine Functions</span>
                </div>
              </div>
            </div>
            
            <div className="mt-4">
              <div className="flex flex-wrap gap-2">
                {value.includes('T') && (
                  <div className="px-2 py-1 bg-blue-100 text-blue-800 rounded-md text-xs">
                    Tool Change
                  </div>
                )}
                {value.includes('S') && (
                  <div className="px-2 py-1 bg-green-100 text-green-800 rounded-md text-xs">
                    Speed Control
                  </div>
                )}
                {value.includes('F') && (
                  <div className="px-2 py-1 bg-purple-100 text-purple-800 rounded-md text-xs">
                    Feed Control
                  </div>
                )}
                {(value.includes('M3') || value.includes('M03')) && (
                  <div className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-md text-xs">
                    Spindle Rotation
                  </div>
                )}
                {(value.includes('M8') || value.includes('M08')) && (
                  <div className="px-2 py-1 bg-blue-100 text-blue-800 rounded-md text-xs">
                    Coolant
                  </div>
                )}
                {isFanucGCode && (
                  <div className="px-2 py-1 bg-orange-100 text-orange-800 rounded-md text-xs">
                    Fanuc Code
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
            <p className="text-gray-500 text-center py-4">Load G-Code to see the analysis</p>
        )}
      </div>
      
      <div className='pb-6'>
        {/* AI Optimizer for Fanuc */}
        {lines.length > 0 && isFanucGCode && (
          <AIOptimizer gcode={value} onApplyOptimized={handleApplyOptimized} />
        )}
      </div>
      
      {/* G-Code Copilot */}
      
      
      {/* Context Menu */}
      <GCodeContextMenu
        visible={contextMenu.visible}
        position={contextMenu.position}
        selectedCode={contextMenu.selectedCode}
        onClose={closeContextMenu}
      />
      
      {/* Pulsante Torna Su */}
      {showScrollTop && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-6 right-6 p-3 rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 focus:outline-none transition-all duration-300 z-10"
          aria-label="Torna all'inizio"
        >
          <ChevronUp size={20} />
        </button>
      )}
      
      {/* Aggiungiamo un po' di spazio alla fine per garantire lo scrolling */}
      <div className="h-6"></div>
    </div>
  );
};

export default GCodeEditor;
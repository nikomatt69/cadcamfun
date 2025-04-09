// src/components/cam/GCodeViewer.tsx
import React, { useEffect, useState, useRef } from 'react';
import { AlertTriangle, Info, ChevronUp } from 'react-feather';

interface GCodeViewerProps {
  width: string;
  height: string;
  gcode: string;
  isSimulating: boolean;
}

interface Point {
  x: number;
  y: number;
  z: number;
}

interface GCodeStats {
  totalLines: number;
  rapidMoves: number;
  linearMoves: number;
  circularMoves: number;
  machineFunctions: number;
  boundaries: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
  };
}

const GCodeViewer: React.FC<GCodeViewerProps> = ({ 
  width, 
  height,
  gcode,
  isSimulating
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [toolPath, setToolPath] = useState<Point[]>([]);
  const [currentPoint, setCurrentPoint] = useState<number>(0);
  const [stats, setStats] = useState<GCodeStats>({
    totalLines: 0,
    rapidMoves: 0,
    linearMoves: 0,
    circularMoves: 0,
    machineFunctions: 0,
    boundaries: {
      minX: 0,
      maxX: 0,
      minY: 0,
      maxY: 0,
      minZ: 0,
      maxZ: 0
    }
  });
  const [scale, setScale] = useState<number>(1);
  const [offset, setOffset] = useState<{ x: number, y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number, y: number }>({ x: 0, y: 0 });
  const animationRef = useRef<number | null>(null);
  const [showScrollTop, setShowScrollTop] = useState<boolean>(false);
  const [additionalInfoVisible, setAdditionalInfoVisible] = useState<boolean>(true);

  // Parse G-code and extract toolpath
  useEffect(() => {
    if (!gcode) {
      setToolPath([]);
      return;
    }

    const points: Point[] = [];
    const lines = gcode.split('\n');
    let rapidMoves = 0;
    let linearMoves = 0;
    let circularMoves = 0;
    let machineFunctions = 0;
    
    let currentX = 0;
    let currentY = 0;
    let currentZ = 0;
    
    let minX = 0, maxX = 0, minY = 0, maxY = 0, minZ = 0, maxZ = 0;
    let firstPoint = true;
    
    lines.forEach(line => {
      const trimmedLine = line.trim();
      if (!trimmedLine || trimmedLine.startsWith(';')) return; // Skip comments and empty lines
      
      const isG0 = trimmedLine.includes('G0') || trimmedLine.includes('G00');
      const isG1 = trimmedLine.includes('G1') || trimmedLine.includes('G01');
      const isG2G3 = trimmedLine.match(/G2|G02|G3|G03/);
      const isM = trimmedLine.includes('M') && !trimmedLine.match(/^\s*;/);
      
      if (isG0) rapidMoves++;
      if (isG1) linearMoves++;
      if (isG2G3) circularMoves++;
      if (isM) machineFunctions++;
      
      if (isG0 || isG1 || isG2G3) {
        // Extract coordinates
        const xMatch = trimmedLine.match(/X([+-]?\d*\.?\d+)/);
        const yMatch = trimmedLine.match(/Y([+-]?\d*\.?\d+)/);
        const zMatch = trimmedLine.match(/Z([+-]?\d*\.?\d+)/);
        
        if (xMatch) currentX = parseFloat(xMatch[1]);
        if (yMatch) currentY = parseFloat(yMatch[1]);
        if (zMatch) currentZ = parseFloat(zMatch[1]);
        
        // Update boundaries
        if (firstPoint) {
          minX = maxX = currentX;
          minY = maxY = currentY;
          minZ = maxZ = currentZ;
          firstPoint = false;
        } else {
          minX = Math.min(minX, currentX);
          maxX = Math.max(maxX, currentX);
          minY = Math.min(minY, currentY);
          maxY = Math.max(maxY, currentY);
          minZ = Math.min(minZ, currentZ);
          maxZ = Math.max(maxZ, currentZ);
        }
        
        points.push({ x: currentX, y: currentY, z: currentZ });
      }
    });
    
    setToolPath(points);
    setCurrentPoint(0);
    setStats({
      totalLines: lines.length,
      rapidMoves,
      linearMoves,
      circularMoves,
      machineFunctions,
      boundaries: {
        minX,
        maxX,
        minY,
        maxY,
        minZ,
        maxZ
      }
    });
    
    // Calculate appropriate scaling
    if (canvasRef.current && points.length > 0) {
      const canvas = canvasRef.current;
      const width = canvas.width;
      const height = canvas.height;
      
      const rangeX = maxX - minX;
      const rangeY = maxY - minY;
      
      if (rangeX > 0 && rangeY > 0) {
        const scaleX = (width - 40) / rangeX;
        const scaleY = (height - 40) / rangeY;
        
        const newScale = Math.min(scaleX, scaleY);
        setScale(newScale);
        
        // Center the drawing
        const offsetX = (width / 2) - ((minX + maxX) / 2 * newScale);
        const offsetY = (height / 2) - ((minY + maxY) / 2 * newScale);
        setOffset({ x: offsetX, y: offsetY });
      }
    }
  }, [gcode]);

  // Draw toolpath on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || toolPath.length === 0) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw grid
    ctx.strokeStyle = '#e5e5e5';
    ctx.lineWidth = 0.5;
    
    const gridSize = 10 * scale;
    const offsetX = Math.floor(offset.x % gridSize);
    const offsetY = Math.floor(offset.y % gridSize);
    
    for (let x = offsetX; x < canvas.width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    
    for (let y = offsetY; y < canvas.height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
    
    // Draw axes
    ctx.strokeStyle = '#cccccc';
    ctx.lineWidth = 1;
    
    // X axis
    ctx.beginPath();
    ctx.moveTo(0, canvas.height / 2);
    ctx.lineTo(canvas.width, canvas.height / 2);
    ctx.stroke();
    
    // Y axis
    ctx.beginPath();
    ctx.moveTo(canvas.width / 2, 0);
    ctx.lineTo(canvas.width / 2, canvas.height);
    ctx.stroke();
    
    // Draw toolpath
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    for (let i = 0; i < toolPath.length; i++) {
      const point = toolPath[i];
      const x = point.x * scale + offset.x;
      const y = canvas.height - (point.y * scale + offset.y); // Flip Y axis
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    
    ctx.stroke();
    
    // Draw current point if simulating
    if (isSimulating && currentPoint < toolPath.length) {
      const point = toolPath[currentPoint];
      const x = point.x * scale + offset.x;
      const y = canvas.height - (point.y * scale + offset.y);
      
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [toolPath, scale, offset, currentPoint, isSimulating]);
  
  // Handle simulation animation
  useEffect(() => {
    if (!isSimulating || toolPath.length === 0) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      return;
    }
    
    let lastTimestamp = 0;
    const simulationSpeed = 5; // Points per second
    
    const animate = (timestamp: number) => {
      if (!lastTimestamp) lastTimestamp = timestamp;
      
      const deltaTime = timestamp - lastTimestamp;
      if (deltaTime > (1000 / simulationSpeed)) {
        if (currentPoint < toolPath.length - 1) {
          setCurrentPoint(prev => prev + 1);
          lastTimestamp = timestamp;
        }
      }
      
      if (currentPoint < toolPath.length - 1) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };
    
    animationRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isSimulating, currentPoint, toolPath.length]);
  
  // Handle canvas resize
  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current && canvasRef.current.parentElement) {
        canvasRef.current.width = canvasRef.current.parentElement.clientWidth;
        canvasRef.current.height = canvasRef.current.parentElement.clientHeight;
      }
    };
    
    handleResize();
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Gestione dello scroll per mostrare/nascondere il pulsante "torna su"
  useEffect(() => {
    const handleScroll = () => {
      if (containerRef.current) {
        setShowScrollTop(containerRef.current.scrollTop > 300);
      }
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
    }

    return () => {
      if (container) {
        container.removeEventListener('scroll', handleScroll);
      }
    };
  }, []);
  
  // Handle mouse interactions for panning
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };
  
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging) return;
    
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    
    setOffset(prev => ({
      x: prev.x + dx,
      y: prev.y + dy
    }));
    
    setDragStart({ x: e.clientX, y: e.clientY });
  };
  
  const handleMouseUp = () => {
    setIsDragging(false);
  };
  
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    
    const zoomIntensity = 0.1;
    const delta = e.deltaY > 0 ? -zoomIntensity : zoomIntensity;
    
    setScale(prev => Math.max(0.1, prev + prev * delta));
  };
  
  // Reset view
  const resetView = () => {
    if (toolPath.length > 0 && canvasRef.current) {
      const canvas = canvasRef.current;
      const { minX, maxX, minY, maxY } = stats.boundaries;
      
      const rangeX = maxX - minX;
      const rangeY = maxY - minY;
      
      if (rangeX > 0 && rangeY > 0) {
        const scaleX = (canvas.width - 40) / rangeX;
        const scaleY = (canvas.height - 40) / rangeY;
        
        const newScale = Math.min(scaleX, scaleY);
        setScale(newScale);
        
        // Center the drawing
        const offsetX = (canvas.width / 2) - ((minX + maxX) / 2 * newScale);
        const offsetY = (canvas.height / 2) - ((minY + maxY) / 2 * newScale);
        setOffset({ x: offsetX, y: offsetY });
      }
    }
  };

  // Toggle additional info panel
  const toggleAdditionalInfo = () => {
    setAdditionalInfoVisible(!additionalInfoVisible);
  };

  // Funzione per tornare all'inizio della pagina
  const scrollToTop = () => {
    if (containerRef.current) {
      containerRef.current.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    }
  };

  return (
    <div 
      ref={containerRef}
      className="h-full w-full flex flex-col overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent"
      style={{ maxHeight: height || '800px' }}
    >
      <div className="relative flex-1" style={{ width, minHeight: '400px' }}>
        <canvas
          ref={canvasRef}
          className="absolute inset-0 cursor-move"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
        />
        
        {!gcode && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-50 bg-opacity-80">
            <div className="text-center p-6 bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white rounded-lg shadow-md">
              <h3 className="text-lg font-medium text-gray-900 mb-2">Nessun G-Code caricato</h3>
              <p className="text-gray-600">
                Importa un file G-Code o generane uno con il generatore di percorsi per visualizzare qui.
              </p>
            </div>
          </div>
        )}
        
        <div className="absolute top-4 left-4 p-2 bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white bg-opacity-80 rounded-md shadow-sm">
          {toolPath.length > 0 && (
            <>
              <p className="text-sm font-medium">Posizione corrente:</p>
              {currentPoint < toolPath.length && (
                <p className="text-xs text-gray-600">
                  X: {toolPath[currentPoint].x.toFixed(2)}, 
                  Y: {toolPath[currentPoint].y.toFixed(2)}, 
                  Z: {toolPath[currentPoint].z.toFixed(2)}
                </p>
              )}
              <div className="mt-2">
                <p className="text-xs text-gray-500">Zoom: {(scale * 100).toFixed(0)}%</p>
              </div>
            </>
          )}
        </div>
        
        <div className="absolute top-4 right-4 space-y-2">
          <button 
            className="p-2 bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white rounded-md shadow-sm hover:bg-gray-100 block"
            onClick={resetView}
            title="Reset View"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
              <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>
          </button>

          <button 
            className="p-2 bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white rounded-md shadow-sm hover:bg-gray-100 block"
            onClick={toggleAdditionalInfo}
            title={additionalInfoVisible ? "Nascondi dettagli" : "Mostra dettagli"}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
          </button>
        </div>
        
        {toolPath.length > 0 && additionalInfoVisible && (
          <div className="absolute bottom-4 left-4 right-4 p-3 bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white bg-opacity-90 rounded-md shadow-sm text-xs">
            <div className="flex justify-between items-center">
              <div>
                <span className="font-medium">Dimensioni:</span> X: {stats.boundaries.minX.toFixed(2)} - {stats.boundaries.maxX.toFixed(2)}, 
                Y: {stats.boundaries.minY.toFixed(2)} - {stats.boundaries.maxY.toFixed(2)}, 
                Z: {stats.boundaries.minZ.toFixed(2)} - {stats.boundaries.maxZ.toFixed(2)}
              </div>
              <div className="flex space-x-4">
                <div>
                  <span className="font-medium">Rapidi:</span> {stats.rapidMoves}
                </div>
                <div>
                  <span className="font-medium">Lineari:</span> {stats.linearMoves}
                </div>
                <div>
                  <span className="font-medium">Circolari:</span> {stats.circularMoves}
                </div>
              </div>
            </div>
            
            <div className="mt-1 text-gray-500 flex items-center">
              <Info size={12} className="mr-1" />
              Usa il mouse per spostare la vista. Rotella per zoom.
            </div>
          </div>
        )}
      </div>

      {/* Dettagli statistici avanzati */}
      {toolPath.length > 0 && (
        <div className="bg-[#F8FBFF]  dark:bg-gray-800 dark:text-white shadow-md rounded-md p-4 mt-4 mx-2 mb-2">
          <h3 className="text-lg font-medium text-gray-900 mb-2">Analisi dettagliata</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-3 bg-gray-50 rounded-md">
              <p className="text-sm font-medium text-gray-700">Totale Punti</p>
              <p className="text-xl font-bold text-blue-600">{toolPath.length}</p>
            </div>
            
            <div className="p-3 bg-blue-50 rounded-md">
              <p className="text-sm font-medium text-gray-700">Movimenti Rapidi</p>
              <p className="text-xl font-bold text-blue-600">{stats.rapidMoves}</p>
            </div>
            
            <div className="p-3 bg-green-50 rounded-md">
              <p className="text-sm font-medium text-gray-700">Movimenti Lineari</p>
              <p className="text-xl font-bold text-green-600">{stats.linearMoves}</p>
            </div>
            
            <div className="p-3 bg-purple-50 rounded-md">
              <p className="text-sm font-medium text-gray-700">Movimenti Circolari</p>
              <p className="text-xl font-bold text-purple-600">{stats.circularMoves}</p>
            </div>
          </div>
          
          <div className="mt-4 p-3 bg-gray-50 rounded-md">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Dimensioni di lavoro</h4>
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div>
                <span className="font-medium">Larghezza:</span> {(stats.boundaries.maxX - stats.boundaries.minX).toFixed(2)} mm
              </div>
              <div>
                <span className="font-medium">Altezza:</span> {(stats.boundaries.maxY - stats.boundaries.minY).toFixed(2)} mm
              </div>
              <div>
                <span className="font-medium">Profondità:</span> {(stats.boundaries.maxZ - stats.boundaries.minZ).toFixed(2)} mm
              </div>
            </div>
          </div>
          
          <div className="mt-4 p-3 bg-yellow-50 rounded-md">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Aiuti per la Navigazione</h4>
            <div className="flex flex-wrap gap-4 text-xs text-gray-600">
              <div className="flex items-center">
                <div className="w-4 h-4 bg-blue-100 mr-1 border border-blue-200"></div>
                <span>Spostare: Click e Trascina</span>
              </div>
              <div className="flex items-center">
                <div className="w-4 h-4 bg-green-100 mr-1 border border-green-200"></div>
                <span>Zoom: Rotella Mouse</span>
              </div>
              <div className="flex items-center">
                <div className="w-4 h-4 bg-purple-100 mr-1 border border-purple-200"></div>
                <span>Reset Vista: Pulsante Home</span>
              </div>
            </div>
          </div>
        </div>
      )}
      
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
      
      {/* Spazio alla fine per garantire lo scrolling */}
      <div className="h-6"></div>
    </div>
  );
};

export default GCodeViewer;
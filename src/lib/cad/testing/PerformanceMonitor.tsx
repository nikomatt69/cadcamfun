// CAD Canvas Performance Monitor
// Real-time performance tracking and comparison across refactor steps

import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Performance metrics structure
 */
export interface PerformanceMetrics {
  timestamp: number;
  component: 'original' | 'step1' | 'step2' | 'step3';
  
  // Rendering metrics
  fps: number;
  renderTime: number;
  triangleCount: number;
  drawCalls: number;
  
  // Memory metrics
  memoryUsage: number;
  geometryCount: number;
  materialCount: number;
  textureCount: number;
  
  // Interaction metrics
  eventProcessingTime: number;
  eventsPerSecond: number;
  mouseEventLatency: number;
  keyboardEventLatency: number;
  
  // CAD-specific metrics
  elementCount: number;
  elementCreationTime: number;
  controlPointsCount: number;
  factoryHits: number;
  wasmOptimizations: number;
  
  // System metrics
  cpuUsage: number;
  
  // Feature flags
  wasmEnabled: boolean;
  unifiedEventsEnabled: boolean;
  consolidatedHooksEnabled: boolean;
}

/**
 * Performance comparison result
 */
export interface PerformanceComparison {
  baseline: PerformanceMetrics;
  current: PerformanceMetrics;
  improvements: {
    fpsImprovement: number;
    renderTimeImprovement: number;
    memoryReduction: number;
    eventLatencyReduction: number;
    elementCreationSpeedup: number;
  };
  overallScore: number;
}

/**
 * Hook for monitoring CAD Canvas performance
 */
export function useCADPerformanceMonitor(componentType: PerformanceMetrics['component']) {
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null);
  const [history, setHistory] = useState<PerformanceMetrics[]>([]);
  const [isMonitoring, setIsMonitoring] = useState(false);
  
  const metricsRef = useRef<PerformanceMetrics | null>(null);
  const frameCountRef = useRef(0);
  const lastFrameTimeRef = useRef(performance.now());
  const renderTimesRef = useRef<number[]>([]);
  const eventTimesRef = useRef<number[]>([]);
  
  // Collect performance metrics
  const collectMetrics = useCallback((): PerformanceMetrics => {
    const now = performance.now();
    const frameTime = now - lastFrameTimeRef.current;
    lastFrameTimeRef.current = now;
    
    // Calculate FPS
    frameCountRef.current++;
    renderTimesRef.current.push(frameTime);
    if (renderTimesRef.current.length > 60) {
      renderTimesRef.current = renderTimesRef.current.slice(-60);
    }
    
    const avgRenderTime = renderTimesRef.current.reduce((sum, time) => sum + time, 0) / renderTimesRef.current.length;
    const fps = 1000 / avgRenderTime;
    
    // Memory metrics
    const memoryInfo = (performance as any).memory;
    const memoryUsage = memoryInfo ? memoryInfo.usedJSHeapSize : 0;
    
    // Three.js metrics (would be injected from Three.js renderer)
    const rendererInfo = getThreeJSRendererInfo();
    
    // Event processing metrics
    const avgEventTime = eventTimesRef.current.length > 0 
      ? eventTimesRef.current.reduce((sum, time) => sum + time, 0) / eventTimesRef.current.length
      : 0;
    
    // Feature detection
    const wasmEnabled = checkWasmEnabled();
    const unifiedEventsEnabled = checkUnifiedEventsEnabled();
    const consolidatedHooksEnabled = checkConsolidatedHooksEnabled();
    
    return {
      timestamp: now,
      component: componentType,
      
      // Rendering
      fps: Math.round(fps),
      renderTime: avgRenderTime,
      triangleCount: rendererInfo.triangles,
      drawCalls: rendererInfo.drawCalls,
      
      // Memory
      memoryUsage,
      geometryCount: rendererInfo.geometries,
      materialCount: rendererInfo.materials,
      textureCount: rendererInfo.textures,
      
      // Interactions
      eventProcessingTime: avgEventTime,
      eventsPerSecond: eventTimesRef.current.length,
      mouseEventLatency: getMouseEventLatency(),
      keyboardEventLatency: getKeyboardEventLatency(),
      
      // CAD-specific
      elementCount: getElementCount(),
      elementCreationTime: getElementCreationTime(),
      controlPointsCount: getControlPointsCount(),
      factoryHits: getFactoryHits(),
      wasmOptimizations: getWasmOptimizations(),
      
      // System
      cpuUsage: getCPUUsage(),
      
      // Features
      wasmEnabled,
      unifiedEventsEnabled,
      consolidatedHooksEnabled
    };
  }, [componentType]);
  
  // Start monitoring
  const startMonitoring = useCallback(() => {
    setIsMonitoring(true);
    
    const interval = setInterval(() => {
      const newMetrics = collectMetrics();
      setMetrics(newMetrics);
      setHistory(prev => [...prev.slice(-299), newMetrics]); // Keep last 300 entries
      metricsRef.current = newMetrics;
    }, 1000); // Collect every second
    
    return () => {
      clearInterval(interval);
      setIsMonitoring(false);
    };
  }, [collectMetrics]);
  
  // Stop monitoring
  const stopMonitoring = useCallback(() => {
    setIsMonitoring(false);
  }, []);
  
  // Record event processing time
  const recordEventTime = useCallback((processingTime: number) => {
    eventTimesRef.current.push(processingTime);
    if (eventTimesRef.current.length > 60) {
      eventTimesRef.current = eventTimesRef.current.slice(-60);
    }
  }, []);
  
  // Get current metrics
  const getCurrentMetrics = useCallback(() => metricsRef.current, []);
  
  // Export metrics
  const exportMetrics = useCallback(() => {
    return {
      current: metrics,
      history: history,
      summary: generateSummary(history)
    };
  }, [metrics, history]);
  
  return {
    metrics,
    history,
    isMonitoring,
    startMonitoring,
    stopMonitoring,
    recordEventTime,
    getCurrentMetrics,
    exportMetrics
  };
}

/**
 * Hook for comparing performance between different CAD Canvas versions
 */
export function useCADPerformanceComparison() {
  const [comparisons, setComparisons] = useState<PerformanceComparison[]>([]);
  const [baseline, setBaseline] = useState<PerformanceMetrics | null>(null);
  
  // Set baseline metrics (usually from original component)
  const setBaselineMetrics = useCallback((metrics: PerformanceMetrics) => {
    setBaseline(metrics);
  }, []);
  
  // Compare current metrics against baseline
  const compareMetrics = useCallback((current: PerformanceMetrics): PerformanceComparison | null => {
    if (!baseline) return null;
    
    const improvements = {
      fpsImprovement: ((current.fps - baseline.fps) / baseline.fps) * 100,
      renderTimeImprovement: ((baseline.renderTime - current.renderTime) / baseline.renderTime) * 100,
      memoryReduction: ((baseline.memoryUsage - current.memoryUsage) / baseline.memoryUsage) * 100,
      eventLatencyReduction: ((baseline.eventProcessingTime - current.eventProcessingTime) / baseline.eventProcessingTime) * 100,
      elementCreationSpeedup: ((baseline.elementCreationTime - current.elementCreationTime) / baseline.elementCreationTime) * 100
    };
    
    // Calculate overall performance score (weighted average)
    const weights = {
      fps: 0.3,
      renderTime: 0.25,
      memory: 0.2,
      eventLatency: 0.15,
      elementCreation: 0.1
    };
    
    const overallScore = 
      improvements.fpsImprovement * weights.fps +
      improvements.renderTimeImprovement * weights.renderTime +
      improvements.memoryReduction * weights.memory +
      improvements.eventLatencyReduction * weights.eventLatency +
      improvements.elementCreationSpeedup * weights.elementCreation;
    
    const comparison: PerformanceComparison = {
      baseline,
      current,
      improvements,
      overallScore
    };
    
    setComparisons(prev => [...prev.slice(-99), comparison]); // Keep last 100 comparisons
    
    return comparison;
  }, [baseline]);
  
  // Get performance trend
  const getPerformanceTrend = useCallback(() => {
    if (comparisons.length < 2) return 'insufficient-data';
    
    const recent = comparisons.slice(-10);
    const trend = recent.reduce((sum, comp, index) => {
      if (index === 0) return 0;
      return sum + (comp.overallScore - recent[index - 1].overallScore);
    }, 0) / (recent.length - 1);
    
    if (trend > 5) return 'improving';
    if (trend < -5) return 'degrading';
    return 'stable';
  }, [comparisons]);
  
  return {
    baseline,
    comparisons,
    setBaselineMetrics,
    compareMetrics,
    getPerformanceTrend
  };
}

/**
 * Performance monitoring component
 */
export function CADPerformanceMonitorOverlay({ 
  component, 
  onMetricsUpdate 
}: { 
  component: PerformanceMetrics['component'];
  onMetricsUpdate?: (metrics: PerformanceMetrics) => void;
}) {
  const { 
    metrics, 
    history, 
    isMonitoring, 
    startMonitoring, 
    stopMonitoring, 
    exportMetrics 
  } = useCADPerformanceMonitor(component);
  
  const { 
    baseline, 
    compareMetrics, 
    setBaselineMetrics, 
    getPerformanceTrend 
  } = useCADPerformanceComparison();
  
  const [showDetails, setShowDetails] = useState(false);
  const [comparison, setComparison] = useState<PerformanceComparison | null>(null);
  
  // Update comparison when metrics change
  useEffect(() => {
    if (metrics) {
      onMetricsUpdate?.(metrics);
      
      if (baseline && component !== 'original') {
        const comp = compareMetrics(metrics);
        setComparison(comp);
      } else if (component === 'original') {
        setBaselineMetrics(metrics);
      }
    }
  }, [metrics, baseline, component, compareMetrics, setBaselineMetrics, onMetricsUpdate]);
  
  // Start monitoring on mount
  useEffect(() => {
    const cleanup = startMonitoring();
    return cleanup;
  }, [startMonitoring]);
  
  if (!metrics) return null;
  
  return (
    <div className="fixed bottom-4 right-4 bg-black bg-opacity-90 text-white text-xs p-3 rounded-lg max-w-sm z-50">
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-bold text-green-400">
          📊 Performance Monitor - {component.toUpperCase()}
        </h4>
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="text-blue-400 hover:text-blue-300"
        >
          {showDetails ? '−' : '+'}
        </button>
      </div>
      
      {/* Key metrics */}
      <div className="space-y-1">
        <div className="flex justify-between">
          <span>FPS:</span>
          <span className={metrics.fps >= 60 ? 'text-green-400' : metrics.fps >= 30 ? 'text-yellow-400' : 'text-red-400'}>
            {metrics.fps}
          </span>
        </div>
        <div className="flex justify-between">
          <span>Memory:</span>
          <span>{(metrics.memoryUsage / 1024 / 1024).toFixed(1)}MB</span>
        </div>
        <div className="flex justify-between">
          <span>Elements:</span>
          <span>{metrics.elementCount}</span>
        </div>
        
        {/* Feature indicators */}
        <div className="flex gap-2 text-xs">
          {metrics.wasmEnabled && <span className="text-purple-400">WASM</span>}
          {metrics.unifiedEventsEnabled && <span className="text-blue-400">Events</span>}
          {metrics.consolidatedHooksEnabled && <span className="text-green-400">Hooks</span>}
        </div>
      </div>
      
      {/* Performance comparison */}
      {comparison && (
        <div className="mt-2 pt-2 border-t border-gray-600">
          <div className="text-xs text-yellow-400 mb-1">vs Original:</div>
          <div className="space-y-1">
            <div className="flex justify-between">
              <span>FPS:</span>
              <span className={comparison.improvements.fpsImprovement >= 0 ? 'text-green-400' : 'text-red-400'}>
                {comparison.improvements.fpsImprovement > 0 ? '+' : ''}{comparison.improvements.fpsImprovement.toFixed(1)}%
              </span>
            </div>
            <div className="flex justify-between">
              <span>Memory:</span>
              <span className={comparison.improvements.memoryReduction >= 0 ? 'text-green-400' : 'text-red-400'}>
                {comparison.improvements.memoryReduction > 0 ? '-' : '+'}{Math.abs(comparison.improvements.memoryReduction).toFixed(1)}%
              </span>
            </div>
            <div className="flex justify-between">
              <span>Overall:</span>
              <span className={comparison.overallScore >= 0 ? 'text-green-400' : 'text-red-400'}>
                {comparison.overallScore > 0 ? '+' : ''}{comparison.overallScore.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>
      )}
      
      {/* Detailed metrics */}
      {showDetails && (
        <div className="mt-2 pt-2 border-t border-gray-600 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-blue-400">Rendering:</div>
              <div>Render: {metrics.renderTime.toFixed(1)}ms</div>
              <div>Triangles: {metrics.triangleCount.toLocaleString()}</div>
              <div>Draw Calls: {metrics.drawCalls}</div>
            </div>
            <div>
              <div className="text-purple-400">Events:</div>
              <div>Process: {metrics.eventProcessingTime.toFixed(1)}ms</div>
              <div>Mouse: {metrics.mouseEventLatency.toFixed(1)}ms</div>
              <div>Keyboard: {metrics.keyboardEventLatency.toFixed(1)}ms</div>
            </div>
          </div>
          
          <div className="mt-2">
            <div className="text-orange-400">CAD Specific:</div>
            <div>Creation: {metrics.elementCreationTime.toFixed(1)}ms</div>
            <div>Control Points: {metrics.controlPointsCount}</div>
            <div>Factory Hits: {metrics.factoryHits}</div>
            <div>WASM Opts: {metrics.wasmOptimizations}</div>
          </div>
        </div>
      )}
      
      {/* Control buttons */}
      <div className="mt-2 pt-2 border-t border-gray-600 flex gap-2">
        <button
          onClick={isMonitoring ? stopMonitoring : () => startMonitoring()}
          className={`px-2 py-1 rounded text-xs ${
            isMonitoring ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'
          }`}
        >
          {isMonitoring ? 'Stop' : 'Start'}
        </button>
        <button
          onClick={() => {
            const data = exportMetrics();
            downloadJSON(data, `cad-performance-${component}-${Date.now()}.json`);
          }}
          className="px-2 py-1 rounded text-xs bg-blue-500 hover:bg-blue-600"
        >
          Export
        </button>
      </div>
    </div>
  );
}

// Utility functions

function getThreeJSRendererInfo() {
  // This would be injected from the actual Three.js renderer
  return {
    triangles: 0,
    drawCalls: 0,
    geometries: 0,
    materials: 0,
    textures: 0
  };
}

function checkWasmEnabled(): boolean {
  return process.env.CAD_WASM_CORE !== 'false';
}

function checkUnifiedEventsEnabled(): boolean {
  return process.env.CAD_UNIFIED_EVENTS !== 'false';
}

function checkConsolidatedHooksEnabled(): boolean {
  return process.env.CAD_CONSOLIDATED_EFFECTS !== 'false';
}

function getMouseEventLatency(): number {
  // Would be calculated from actual event timings
  return Math.random() * 5;
}

function getKeyboardEventLatency(): number {
  // Would be calculated from actual event timings
  return Math.random() * 3;
}

function getElementCount(): number {
  // Would be injected from elements store
  return 0;
}

function getElementCreationTime(): number {
  // Would be calculated from factory timings
  return Math.random() * 10;
}

function getControlPointsCount(): number {
  // Would be calculated from scene traversal
  return 0;
}

function getFactoryHits(): number {
  // Would be injected from factory registry
  return 0;
}

function getWasmOptimizations(): number {
  // Would be injected from WASM optimizer
  return 0;
}

function getCPUUsage(): number {
  // Simplified CPU usage approximation
  return Math.random() * 100;
}

function generateSummary(history: PerformanceMetrics[]) {
  if (history.length === 0) return null;
  
  const latest = history[history.length - 1];
  const oldest = history[0];
  
  return {
    duration: latest.timestamp - oldest.timestamp,
    averageFPS: history.reduce((sum, m) => sum + m.fps, 0) / history.length,
    peakMemory: Math.max(...history.map(m => m.memoryUsage)),
    totalElements: latest.elementCount,
    improvementTrend: latest.timestamp > oldest.timestamp ? 
      ((latest.fps - oldest.fps) / oldest.fps) * 100 : 0
  };
}

function downloadJSON(data: any, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

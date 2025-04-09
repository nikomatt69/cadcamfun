import React, { useEffect, useState } from 'react';
import * as THREE from 'three';

interface PerformanceStats {
  fps: number;
  triangles: number;
  drawCalls: number;
  geometries: number;
  textures: number;
  shaders: number;
  memoryTotal: number;
  memoryGeometries: number;
  memoryTextures: number;
}

interface CanvasPerformanceStatsProps {
  renderer: THREE.WebGLRenderer;
  scene?: THREE.Scene;
  updateInterval?: number;
  darkMode?: boolean;
  className?: string;
}

const CanvasPerformanceStats: React.FC<CanvasPerformanceStatsProps> = ({
  renderer,
  scene,
  updateInterval = 1000,
  darkMode = false,
  className = '',
}) => {
  const [stats, setStats] = useState<PerformanceStats>({
    fps: 0,
    triangles: 0,
    drawCalls: 0,
    geometries: 0,
    textures: 0,
    shaders: 0,
    memoryTotal: 0,
    memoryGeometries: 0,
    memoryTextures: 0,
  });

  const [expanded, setExpanded] = useState(false);
  
  useEffect(() => {
    if (!renderer) return;
    
    let frameCount = 0;
    let lastTime = performance.now();
    
    const updateStats = () => {
      const currentTime = performance.now();
      const elapsed = currentTime - lastTime;
      
      if (elapsed >= updateInterval) {
        const fps = Math.round((frameCount * 1000) / elapsed);
        
        const info = renderer.info;
        const memory = (info.memory || {}) as any;
        const render = info.render || {};
        
        // Count triangles in scene
        let triangles = 0;
        if (scene) {
          scene.traverse((object) => {
            if (object instanceof THREE.Mesh) {
              const geometry = object.geometry;
              if (geometry.index) {
                triangles += geometry.index.count / 3;
              } else if (geometry.attributes.position) {
                triangles += geometry.attributes.position.count / 3;
              }
            }
          });
        }
        
        setStats({
          fps,
          triangles: Math.round(triangles),
          drawCalls: render.calls || 0,
          geometries: memory.geometries || 0,
          textures: memory.textures || 0,
          shaders: renderer.info.programs?.length || 0,
          memoryTotal: (performance as any).memory?.totalJSHeapSize || 0,
          memoryGeometries: memory.geometries || 0,
          memoryTextures: memory.textures || 0,
        });
        
        frameCount = 0;
        lastTime = currentTime;
      }
      
      frameCount++;
      requestAnimationFrame(updateStats);
    };
    
    updateStats();
    
    return () => {
      // No way to cancel requestAnimationFrame directly, but the function
      // won't run after component unmount
    };
  }, [renderer, scene, updateInterval]);
  
  // Format bytes to human readable
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    
    return `${parseFloat((bytes / Math.pow(1024, i)).toFixed(2))} ${sizes[i]}`;
  };

  return (
    <div 
      className={`performance-stats ${darkMode ? 'dark' : 'light'} ${expanded ? 'expanded' : 'collapsed'} ${className}`}
      style={{
        position: 'absolute',
        top: '10px',
        right: '10px',
        zIndex: 1000,
        backgroundColor: darkMode ? 'rgba(30, 30, 30, 0.85)' : 'rgba(255, 255, 255, 0.85)',
        backdropFilter: 'blur(8px)',
        borderRadius: '6px',
        padding: '8px 12px',
        color: darkMode ? '#e0e0e0' : '#333',
        fontSize: '12px',
        fontFamily: 'monospace',
        boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)',
        userSelect: 'none',
        minWidth: '120px',
      }}
    >
      <div 
        className="stats-header"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: expanded ? '8px' : '0',
          cursor: 'pointer',
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <span style={{ fontWeight: 'bold' }}>
          FPS: <span style={{ color: getFpsColor(stats.fps) }}>{stats.fps}</span>
        </span>
        <button 
          style={{ 
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: '0',
            display: 'flex',
            alignItems: 'center',
            color: 'inherit',
          }}
        >
          {expanded ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="18 15 12 9 6 15"></polyline>
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          )}
        </button>
      </div>
      
      {expanded && (
        <div className="stats-details" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div className="stat-row">
            Triangles: <span className="value">{stats.triangles.toLocaleString()}</span>
          </div>
          <div className="stat-row">
            Draw calls: <span className="value">{stats.drawCalls}</span>
          </div>
          <div className="stat-row">
            Geometries: <span className="value">{stats.geometries}</span>
          </div>
          <div className="stat-row">
            Textures: <span className="value">{stats.textures}</span>
          </div>
          <div className="stat-row">
            Shaders: <span className="value">{stats.shaders}</span>
          </div>
          
          {(performance as any).memory && (
            <div className="stat-row">
              Memory: <span className="value">{formatBytes(stats.memoryTotal)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Color coding for FPS values
const getFpsColor = (fps: number): string => {
  if (fps >= 55) return '#4ade80'; // good (green)
  if (fps >= 30) return '#facc15'; // okay (yellow)
  return '#f87171'; // poor (red)
};

export default CanvasPerformanceStats; 
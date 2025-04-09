import React from 'react';

interface CoordinateDisplayProps {
  position: { x: number; y: number; z: number };
  precision?: number;
  units?: string;
  showGrid?: boolean;
  showLabels?: boolean;
  darkMode?: boolean;
  className?: string;
}

export const CoordinateDisplay: React.FC<CoordinateDisplayProps> = ({
  position,
  precision = 2,
  units = 'mm',
  showGrid = true,
  showLabels = true,
  darkMode = false,
  className = '',
}) => {
  const formatCoordinate = (value: number) => value.toFixed(precision);
  
  return (
    <div 
      className={`coordinate-display ${darkMode ? 'dark' : 'light'} ${className}`}
      style={{
        position: 'absolute',
        left: '20px',
        bottom: '20px',
        zIndex: 100,
        display: 'flex',
        flexDirection: 'row',
        gap: '8px',
        padding: '8px 12px',
        background: darkMode ? 'rgba(30, 30, 30, 0.85)' : 'rgba(255, 255, 255, 0.85)',
        backdropFilter: 'blur(8px)',
        borderRadius: '6px',
        boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)',
        fontFamily: 'monospace',
        fontSize: '13px',
        color: darkMode ? '#e0e0e0' : '#333',
      }}
    >
      {showGrid && (
        <div className="grid-indicator" style={{ marginRight: '8px', fontSize: '12px', display: 'flex', alignItems: 'center' }}>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ marginRight: '4px' }}
          >
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="3" y1="9" x2="21" y2="9"></line>
            <line x1="3" y1="15" x2="21" y2="15"></line>
            <line x1="9" y1="3" x2="9" y2="21"></line>
            <line x1="15" y1="3" x2="15" y2="21"></line>
          </svg>
          {units}
        </div>
      )}
      
      <div className="coordinate-item" style={{ display: 'flex', alignItems: 'center' }}>
        {showLabels && (
          <span className="coordinate-label" style={{ opacity: 0.7, marginRight: '4px' }}>X:</span>
        )}
        <span className="coordinate-value" style={{ color: '#f87171' }}>
          {formatCoordinate(position.x)}
        </span>
      </div>
      
      <div className="coordinate-item" style={{ display: 'flex', alignItems: 'center' }}>
        {showLabels && (
          <span className="coordinate-label" style={{ opacity: 0.7, marginRight: '4px' }}>Y:</span>
        )}
        <span className="coordinate-value" style={{ color: '#4ade80' }}>
          {formatCoordinate(position.y)}
        </span>
      </div>
      
      <div className="coordinate-item" style={{ display: 'flex', alignItems: 'center' }}>
        {showLabels && (
          <span className="coordinate-label" style={{ opacity: 0.7, marginRight: '4px' }}>Z:</span>
        )}
        <span className="coordinate-value" style={{ color: '#60a5fa' }}>
          {formatCoordinate(position.z)}
        </span>
      </div>
    </div>
  );
}; 
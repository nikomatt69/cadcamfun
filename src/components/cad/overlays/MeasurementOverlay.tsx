import React from 'react';
import { CadMeasurement } from '@/src/types/cad';

interface MeasurementOverlayProps {
  measurements: CadMeasurement[];
  onRemoveMeasurement?: (id: string) => void;
  darkMode?: boolean;
  className?: string;
}

const MeasurementOverlay: React.FC<MeasurementOverlayProps> = ({
  measurements = [],
  onRemoveMeasurement,
  darkMode = false,
  className = '',
}) => {
  const formatValue = (value: number, type: string, displayUnit: string) => {
    let formatted = '';
    
    // Format based on measurement type
    switch (type) {
      case 'distance':
        formatted = value.toFixed(2);
        break;
      case 'angle':
        formatted = value.toFixed(1) + '°';
        break;
      case 'area':
        formatted = value.toFixed(2);
        break;
      case 'volume':
        formatted = value.toFixed(2);
        break;
      default:
        formatted = value.toString();
    }
    
    // Add unit if available
    if (displayUnit && type !== 'angle') {
      formatted += ` ${displayUnit}`;
    }
    
    return formatted;
  };
  
  // Icon based on measurement type
  const getMeasurementIcon = (type: string) => {
    switch (type) {
      case 'distance':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 12h20"></path>
            <path d="M2 12V6"></path>
            <path d="M22 12V6"></path>
          </svg>
        );
      case 'angle':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 12L3 3"></path>
            <path d="M12 12l9-9"></path>
            <path d="M12 21a9 9 0 0 0 9-9"></path>
          </svg>
        );
      case 'area':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2"></rect>
          </svg>
        );
      case 'volume':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 3v18h18"></path>
            <path d="M3 9h18"></path>
            <path d="M15 3v18"></path>
          </svg>
        );
      default:
        return (
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="16"></line>
            <line x1="8" y1="12" x2="16" y2="12"></line>
          </svg>
        );
    }
  };
  
  return (
    <div className={`measurement-overlay ${darkMode ? 'dark' : 'light'} ${className}`}>
      {measurements.map((measurement) => {
        // Calculate display position (this would need to be provided by the 3D engine in real implementation)
        // Here we're just displaying in a list on the side
        return (
          <div
            key={measurement.id}
            className="measurement-item"
            style={{
              position: 'absolute',
              right: '20px',
              top: `${(measurements.indexOf(measurement) * 40) + 20}px`,
              display: 'flex',
              alignItems: 'center',
              padding: '6px 10px',
              borderRadius: '6px',
              background: darkMode ? 'rgba(30, 30, 30, 0.85)' : 'rgba(255, 255, 255, 0.85)',
              backdropFilter: 'blur(8px)',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
              color: darkMode ? '#e0e0e0' : '#333',
              fontSize: '13px',
              zIndex: 100,
            }}
          >
            <div className="measurement-icon" style={{ marginRight: '8px', color: '#60a5fa' }}>
              {getMeasurementIcon(measurement.type)}
            </div>
            
            <div className="measurement-value" style={{ fontWeight: 500 }}>
              {measurement.values.map((value, index) => (
                <span key={index}>
                  {index > 0 && ', '}
                  {formatValue(value, measurement.type, measurement.displayUnit)}
                </span>
              ))}
            </div>
            
            {onRemoveMeasurement && (
              <button
                onClick={() => onRemoveMeasurement(measurement.id)}
                className="remove-measurement"
                style={{
                  background: 'transparent',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginLeft: '8px',
                  padding: '2px',
                  cursor: 'pointer',
                  opacity: 0.7,
                  color: 'inherit',
                }}
                title="Remove measurement"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default MeasurementOverlay; 
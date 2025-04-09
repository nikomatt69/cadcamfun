import React from 'react';
import { CadTool } from '@/src/types/cad';

interface ToolOptionsPanelProps {
  activeTool: CadTool | null;
  onOptionChange: (optionId: string, value: any) => void;
  position?: 'left' | 'right' | 'top' | 'bottom';
  darkMode?: boolean;
  className?: string;
}

const ToolOptionsPanel: React.FC<ToolOptionsPanelProps> = ({
  activeTool,
  onOptionChange,
  position = 'right',
  darkMode = false,
  className = '',
}) => {
  if (!activeTool || !activeTool.options || Object.keys(activeTool.options).length === 0) {
    return null;
  }
  
  // Determine position styles
  const positionStyles: Record<string, React.CSSProperties> = {
    left: { left: '20px', top: '50%', transform: 'translateY(-50%)' },
    right: { right: '20px', top: '50%', transform: 'translateY(-50%)' },
    top: { top: '20px', left: '50%', transform: 'translateX(-50%)' },
    bottom: { bottom: '20px', left: '50%', transform: 'translateX(-50%)' },
  };
  
  const handleInputChange = (optionId: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const { type, value, checked } = event.target;
    
    if (type === 'checkbox') {
      onOptionChange(optionId, checked);
    } else if (type === 'number') {
      onOptionChange(optionId, parseFloat(value));
    } else {
      onOptionChange(optionId, value);
    }
  };
  
  const handleSelectChange = (optionId: string, event: React.ChangeEvent<HTMLSelectElement>) => {
    onOptionChange(optionId, event.target.value);
  };
  
  // Render different input types based on option type
  const renderOptionInput = (optionId: string, option: any) => {
    const value = option.value;
    const type = option.type || typeof value;
    
    switch (type) {
      case 'boolean':
        return (
          <input
            type="checkbox"
            id={`tool-option-${optionId}`}
            checked={Boolean(value)}
            onChange={(e) => handleInputChange(optionId, e)}
            className="tool-option-checkbox"
            style={{
              width: '16px',
              height: '16px',
              accentColor: darkMode ? '#3584e4' : '#3b82f6',
            }}
          />
        );
      
      case 'number':
        return (
          <input
            type="number"
            id={`tool-option-${optionId}`}
            value={value}
            min={option.min}
            max={option.max}
            step={option.step || 1}
            onChange={(e) => handleInputChange(optionId, e)}
            className="tool-option-number"
            style={{
              width: '100%',
              padding: '4px 6px',
              border: '1px solid rgba(128, 128, 128, 0.3)',
              borderRadius: '4px',
              backgroundColor: darkMode ? 'rgba(30, 30, 30, 0.8)' : 'rgba(255, 255, 255, 0.8)',
              color: darkMode ? '#e0e0e0' : '#333',
            }}
          />
        );
      
      case 'select':
        return (
          <select
            id={`tool-option-${optionId}`}
            value={value}
            onChange={(e) => handleSelectChange(optionId, e)}
            className="tool-option-select"
            style={{
              width: '100%',
              padding: '4px 6px',
              border: '1px solid rgba(128, 128, 128, 0.3)',
              borderRadius: '4px',
              backgroundColor: darkMode ? 'rgba(30, 30, 30, 0.8)' : 'rgba(255, 255, 255, 0.8)',
              color: darkMode ? '#e0e0e0' : '#333',
            }}
          >
            {option.options.map((opt: { value: string, label: string }) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        );
      
      case 'color':
        return (
          <input
            type="color"
            id={`tool-option-${optionId}`}
            value={value}
            onChange={(e) => handleInputChange(optionId, e)}
            className="tool-option-color"
            style={{
              width: '100%',
              height: '24px',
              border: '1px solid rgba(128, 128, 128, 0.3)',
              borderRadius: '4px',
              backgroundColor: 'transparent',
            }}
          />
        );
      
      case 'string':
      default:
        return (
          <input
            type="text"
            id={`tool-option-${optionId}`}
            value={value || ''}
            onChange={(e) => handleInputChange(optionId, e)}
            className="tool-option-text"
            style={{
              width: '100%',
              padding: '4px 6px',
              border: '1px solid rgba(128, 128, 128, 0.3)',
              borderRadius: '4px',
              backgroundColor: darkMode ? 'rgba(30, 30, 30, 0.8)' : 'rgba(255, 255, 255, 0.8)',
              color: darkMode ? '#e0e0e0' : '#333',
            }}
          />
        );
    }
  };
  
  return (
    <div 
      className={`tool-options-panel ${position} ${darkMode ? 'dark' : 'light'} ${className}`}
      style={{
        position: 'absolute',
        ...positionStyles[position],
        zIndex: 100,
        padding: '12px',
        width: '240px',
        background: darkMode ? 'rgba(30, 30, 30, 0.85)' : 'rgba(255, 255, 255, 0.85)',
        backdropFilter: 'blur(8px)',
        borderRadius: '8px',
        boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)',
        color: darkMode ? '#e0e0e0' : '#333',
      }}
    >
      <div className="tool-header" style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div 
          className="tool-icon" 
          style={{ 
            width: '24px', 
            height: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          dangerouslySetInnerHTML={{ __html: activeTool.icon }}
        />
        <h3 
          className="tool-name" 
          style={{ 
            margin: 0, 
            fontSize: '16px', 
            fontWeight: 600 
          }}
        >
          {activeTool.name} Options
        </h3>
      </div>
      
      <div className="tool-options-list" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {Object.entries(activeTool.options).map(([optionId, option]) => (
          <div key={optionId} className="tool-option-item" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label 
              htmlFor={`tool-option-${optionId}`}
              className="tool-option-label"
              style={{ 
                fontSize: '13px', 
                marginBottom: '2px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span>{option.label || optionId}</span>
              {option.unit && <span style={{ fontSize: '11px', opacity: 0.7 }}>{option.unit}</span>}
            </label>
            {renderOptionInput(optionId, option)}
            {option.description && (
              <p className="tool-option-description" style={{ fontSize: '11px', margin: '2px 0 0', opacity: 0.7 }}>
                {option.description}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ToolOptionsPanel; 
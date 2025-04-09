import React from 'react';
import { ToolbarPosition } from '@/src/types/ui';
import { CadTool } from '@/src/types/cad';
import { useCADStore } from '@/src/store/cadStore';

interface CanvasToolbarProps {
  position: ToolbarPosition;
  tools: CadTool[];
  activeTool: string | null;
  onSelectTool: (toolId: string) => void;
  darkMode?: boolean;
  className?: string;
}

const CanvasToolbar: React.FC<CanvasToolbarProps> = ({
  position = 'left',
  tools = [],
  activeTool = null,
  onSelectTool,
  darkMode = false,
  className = '',
}) => {
  // Group tools by category
  const toolsByCategory = tools.reduce((groups, tool) => {
    const category = tool.category || 'other';
    if (!groups[category]) {
      groups[category] = [];
    }
    groups[category].push(tool);
    return groups;
  }, {} as Record<string, CadTool[]>);

  // Determine toolbar orientation and style based on position
  const isVertical = position === 'left' || position === 'right';
  const baseClassName = `cad-toolbar ${isVertical ? 'vertical' : 'horizontal'} ${position} ${darkMode ? 'dark' : 'light'} ${className}`;
  
  const positionStyles: Record<ToolbarPosition, React.CSSProperties> = {
    left: { left: 0, top: 0, bottom: 0, flexDirection: 'column' },
    right: { right: 0, top: 0, bottom: 0, flexDirection: 'column' },
    top: { top: 0, left: 0, right: 0, flexDirection: 'row' },
    bottom: { bottom: 0, left: 0, right: 0, flexDirection: 'row' },
  };

  return (
    <div 
      className={baseClassName}
      style={{
        position: 'absolute',
        display: 'flex',
        zIndex: 100,
        background: darkMode ? 'rgba(30, 30, 30, 0.85)' : 'rgba(255, 255, 255, 0.85)',
        backdropFilter: 'blur(8px)',
        boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)',
        borderRadius: isVertical ? '0 8px 8px 0' : '0 0 8px 8px',
        padding: '4px',
        gap: '8px',
        ...positionStyles[position]
      }}
    >
      {Object.entries(toolsByCategory).map(([category, categoryTools]) => (
        <div 
          key={category}
          className="toolbar-category"
          style={{
            display: 'flex',
            flexDirection: isVertical ? 'column' : 'row',
            gap: '2px',
            border: '1px solid rgba(128, 128, 128, 0.2)',
            borderRadius: '6px',
            padding: '4px',
            margin: '2px'
          }}
        >
          <div className="category-label" style={{ fontSize: '10px', opacity: 0.7, textAlign: 'center', textTransform: 'uppercase', marginBottom: isVertical ? '4px' : '0', marginRight: isVertical ? '0' : '4px' }}>
            {category}
          </div>
          {categoryTools.map((tool) => (
            <button
              key={tool.id}
              title={`${tool.tooltip}${tool.shortcut ? ` (${tool.shortcut})` : ''}`}
              className={`tool-button ${activeTool === tool.id ? 'active' : ''}`}
              onClick={() => onSelectTool(tool.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '36px',
                height: '36px',
                borderRadius: '4px',
                border: 'none',
                background: activeTool === tool.id 
                  ? (darkMode ? '#3584e4' : '#b3d4fc') 
                  : 'transparent',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              <span className="icon" dangerouslySetInnerHTML={{ __html: tool.icon }} />
            </button>
          ))}
        </div>
      ))}
    </div>
  );
};

export default CanvasToolbar; 
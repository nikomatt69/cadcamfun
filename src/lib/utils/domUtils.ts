// src/utils/domUtils.ts
import { CursorConfig, getContextualCursor, ToolCursorType } from './cursorUtils';

// Apply cursor-related CSS classes to the body element
export function updateCursorClasses(config: CursorConfig): void {
  const cursor = getContextualCursor(config);
  
  // Remove all existing cursor classes
  document.body.classList.forEach(className => {
    if (className.startsWith('cursor-')) {
      document.body.classList.remove(className);
    }
  });
  
  // Add the active tool class if present
  if (config.activeTool) {
    document.body.classList.add(`cursor-${config.activeTool}`);
  } 
  // Otherwise add the appropriate cursor class based on the computed cursor
  else if (cursor.includes('url(')) {
    // For custom cursors, extract the name from the path
    const match = cursor.match(/url\(['"]?\/cursors\/([^.'"\)]+)/);
    if (match && match[1]) {
      document.body.classList.add(`cursor-${match[1]}`);
    }
  } else {
    // For standard cursors, add the class directly
    document.body.classList.add(`cursor-${cursor}`);
  }
}
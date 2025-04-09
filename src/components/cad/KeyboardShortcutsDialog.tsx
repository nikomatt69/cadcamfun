import React from 'react';
import { X } from 'react-feather';

interface KeyboardShortcutsDialogProps {
 isOpen: boolean;
 onClose: () => void;
}

const KeyboardShortcutsDialog: React.FC<KeyboardShortcutsDialogProps> = ({ 
  isOpen, 
  onClose 
}) => {
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 max-w-md w-full max-h-[80vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold dark:text-white">Keyboard Shortcuts</h2>
          <button 
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-300 dark:hover:text-white"
          >
            <X size={20} />
          </button>
        </div>
        
        <div className="space-y-4">
          <div>
            <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">Navigation</h3>
            <ul className="space-y-2">
              <ShortcutItem keys={['Left Click + Drag']} description="Rotate camera (3D mode)" />
              <ShortcutItem keys={['Middle Click + Drag']} description="Pan view" />
              <ShortcutItem keys={['Scroll']} description="Zoom in/out" />
              <ShortcutItem keys={['+']} description="Zoom in" />
              <ShortcutItem keys={['-']} description="Zoom out" />
              <ShortcutItem keys={['F']} description="Focus on selected object" />
            </ul>
          </div>
          
          <div>
            <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">Selection & Editing</h3>
            <ul className="space-y-2">
              <ShortcutItem keys={['Click']} description="Select object" />
              <ShortcutItem keys={['Shift + Click']} description="Add to selection" />
              <ShortcutItem keys={['Ctrl + A']} description="Select all" />
              <ShortcutItem keys={['Esc']} description="Deselect all / Cancel placement" />
              <ShortcutItem keys={['Del']} description="Delete selected object" />
              <ShortcutItem keys={['G']} description="Move (Grab) mode" />
              <ShortcutItem keys={['R']} description="Rotate mode" />
              <ShortcutItem keys={['S']} description="Scale mode" />
            </ul>
          </div>
          
          <div>
            <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">Actions</h3>
            <ul className="space-y-2">
              <ShortcutItem keys={['Ctrl + Z']} description="Undo" />
              <ShortcutItem keys={['Ctrl + Shift + Z', 'Ctrl + Y']} description="Redo" />
              <ShortcutItem keys={['Ctrl + C']} description="Copy selected" />
              <ShortcutItem keys={['Ctrl + V']} description="Paste" />
              <ShortcutItem keys={['Ctrl + D']} description="Duplicate" />
              <ShortcutItem keys={['Ctrl + S']} description="Save" />
            </ul>
          </div>
          
          <div>
            <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">Display</h3>
            <ul className="space-y-2">
              <ShortcutItem keys={['Tab']} description="Toggle side panel" />
              <ShortcutItem keys={['F11', 'F']} description="Toggle fullscreen" />
              <ShortcutItem keys={['Ctrl + 1']} description="Switch to 3D view" />
              <ShortcutItem keys={['Ctrl + 2']} description="Switch to top view" />
              <ShortcutItem keys={['Ctrl + 3']} description="Switch to front view" />
              <ShortcutItem keys={['Ctrl + 4']} description="Switch to side view" />
              <ShortcutItem keys={['H']} description="Hide selected" />
              <ShortcutItem keys={['Alt + H']} description="Show all" />
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

interface ShortcutItemProps {
  keys: string[];
  description: string;
}

const ShortcutItem: React.FC<ShortcutItemProps> = ({ keys, description }) => {
  return (
    <li className="flex justify-between text-sm">
      <span className="text-gray-700 dark:text-gray-300">{description}</span>
      <div className="flex space-x-2">
        {keys.map((key, index) => (
          <React.Fragment key={index}>
            {index > 0 && <span className="text-gray-400">or</span>}
            <kbd className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-gray-800 dark:text-gray-200 text-xs font-mono">
              {key}
            </kbd>
          </React.Fragment>
        ))}
      </div>
    </li>
  );
};

export default KeyboardShortcutsDialog;
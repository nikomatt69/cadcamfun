// JsonEditor.tsx - Editor di codice con syntax highlighting per Custom Elements
// Fornisce un'interfaccia per modificare il codice JavaScript/JSON

import React, { useState, useRef, useEffect } from 'react';
import { Code, Copy, RotateCcw, HelpCircle } from 'react-feather';
import { CustomElementDefinition } from './types';

interface JsonEditorProps {
  definition: CustomElementDefinition;
  onChange: (updates: Partial<CustomElementDefinition>) => void;
  errors: string[];
}

export const JsonEditor: React.FC<JsonEditorProps> = ({
  definition,
  onChange,
  errors
}) => {
  const [activeSection, setActiveSection] = useState<'geometry' | 'material' | 'parameters'>('geometry');
  const [showHelp, setShowHelp] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const materialConfig = definition.materialConfig ?? { type: 'custom' as const, properties: {} };

  const handleCodeChange = (section: string, code: string) => {
    if (section === 'geometry') {
      onChange({
        geometryCode: code
      });
    } else if (section === 'material') {
      onChange({
        materialConfig: {
          ...materialConfig,
          customCode: code
        }
      });
    }
  };

  const insertTemplate = (template: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const currentCode = activeSection === 'geometry' ? definition.geometryCode : (definition.materialConfig?.customCode || '');
    const newCode = currentCode.substring(0, start) + template + currentCode.substring(end);
    
    handleCodeChange(activeSection, newCode);
    
    // Restore cursor position
    setTimeout(() => {
      textarea.selectionStart = textarea.selectionEnd = start + template.length;
      textarea.focus();
    }, 0);
  };

  const copyToClipboard = () => {
    const code = activeSection === 'geometry' ? definition.geometryCode : (definition.materialConfig?.customCode || '');
    navigator.clipboard.writeText(code);
  };

  const resetToDefault = () => {
    if (activeSection === 'geometry') {
      const defaultCode = `// Create your custom geometry here
// Available variables: THREE, parameters (user inputs)
// Must return a THREE.BufferGeometry or THREE.Object3D

const geometry = new THREE.BoxGeometry(
  parameters.size || 1, 
  parameters.size || 1, 
  parameters.size || 1
);

return geometry;`;
      onChange({ geometryCode: defaultCode });
    } else if (activeSection === 'material') {
      const defaultCode = `// Create custom material
// Available variables: THREE, parameters
// Must return a THREE.Material

return new THREE.MeshStandardMaterial({
  color: parameters.color || '#1e88e5',
  wireframe: parameters.wireframe || false
});`;
      onChange({
        materialConfig: {
          ...materialConfig,
          type: 'custom',
          customCode: defaultCode
        }
      });
    }
  };

  // Code templates for quick insertion
  const geometryTemplates = {
    box: 'new THREE.BoxGeometry(parameters.width || 1, parameters.height || 1, parameters.depth || 1)',
    sphere: 'new THREE.SphereGeometry(parameters.radius || 1, 32, 32)',
    cylinder: 'new THREE.CylinderGeometry(parameters.radius || 1, parameters.radius || 1, parameters.height || 2, 32)',
    cone: 'new THREE.ConeGeometry(parameters.radius || 1, parameters.height || 2, 32)',
    torus: 'new THREE.TorusGeometry(parameters.radius || 1, parameters.tubeRadius || 0.3, 16, 32)',
    
    group: `const group = new THREE.Group();

// Create multiple geometries
const geom1 = new THREE.BoxGeometry(1, 1, 1);
const mesh1 = new THREE.Mesh(geom1);
mesh1.position.set(-1, 0, 0);
group.add(mesh1);

const geom2 = new THREE.SphereGeometry(0.5);
const mesh2 = new THREE.Mesh(geom2);
mesh2.position.set(1, 0, 0);
group.add(mesh2);

return group;`,

    extrude: `// Create extruded shape
const shape = new THREE.Shape();

// Define 2D shape
shape.moveTo(0, 0);
shape.lineTo(parameters.width || 1, 0);
shape.lineTo(parameters.width || 1, parameters.height || 1);
shape.lineTo(0, parameters.height || 1);
shape.closePath();

// Extrude settings
const extrudeSettings = {
  depth: parameters.depth || 0.1,
  bevelEnabled: false
};

return new THREE.ExtrudeGeometry(shape, extrudeSettings);`,

    lathe: `// Create lathe geometry (revolution)
const points = [
  new THREE.Vector2(0, 0),
  new THREE.Vector2(parameters.radius || 1, 0),
  new THREE.Vector2(parameters.radius || 1, parameters.height || 2),
  new THREE.Vector2(0, parameters.height || 2)
];

return new THREE.LatheGeometry(points, parameters.segments || 32);`,

    tube: `// Create tube from curve
const curve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(1, 0, 0)
]);

return new THREE.TubeGeometry(
  curve,
  parameters.tubularSegments || 64,
  parameters.radius || 0.1,
  parameters.radialSegments || 8,
  false
);`
  };

  const materialTemplates = {
    standard: `return new THREE.MeshStandardMaterial({
  color: parameters.color || '#1e88e5',
  metalness: parameters.metalness || 0.5,
  roughness: parameters.roughness || 0.5,
  wireframe: parameters.wireframe || false
});`,

    physical: `return new THREE.MeshPhysicalMaterial({
  color: parameters.color || '#1e88e5',
  metalness: parameters.metalness || 0.5,
  roughness: parameters.roughness || 0.5,
  clearcoat: parameters.clearcoat || 0,
  clearcoatRoughness: parameters.clearcoatRoughness || 0,
  wireframe: parameters.wireframe || false
});`,

    basic: `return new THREE.MeshBasicMaterial({
  color: parameters.color || '#1e88e5',
  wireframe: parameters.wireframe || false,
  transparent: parameters.transparent || false,
  opacity: parameters.opacity || 1
});`,

    lambert: `return new THREE.MeshLambertMaterial({
  color: parameters.color || '#1e88e5',
  wireframe: parameters.wireframe || false
});`
  };

  const getCurrentCode = () => {
    switch (activeSection) {
      case 'geometry':
        return definition.geometryCode;
      case 'material':
        return definition.materialConfig?.customCode || '';
      case 'parameters':
        return JSON.stringify(definition.parameters, null, 2);
      default:
        return '';
    }
  };

  const handleParametersChange = (value: string) => {
    try {
      const parameters = JSON.parse(value);
      onChange({ parameters });
    } catch {
      // Invalid JSON, don't update
    }
  };

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-800">
      {/* Section tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700">
        {[
          { id: 'geometry', label: 'Geometry Code' },
          { id: 'material', label: 'Material Code' },
          { id: 'parameters', label: 'Parameters JSON' }
        ].map(section => (
          <button
            key={section.id}
            onClick={() => setActiveSection(section.id as any)}
            className={`px-3 py-2 text-sm border-b-2 transition-colors ${
              activeSection === section.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
            }`}
          >
            {section.label}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="p-2 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <button
              onClick={copyToClipboard}
              className="p-1 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
              title="Copy to clipboard"
            >
              <Copy className="w-4 h-4" />
            </button>
            
            <button
              onClick={resetToDefault}
              className="p-1 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
              title="Reset to default"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <button
              onClick={() => setShowHelp(!showHelp)}
              className="p-1 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
              title="Show help"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
          </div>

          <div className="text-xs text-gray-500 dark:text-gray-400">
            {activeSection === 'geometry' && 'JavaScript • Must return THREE.BufferGeometry or THREE.Object3D'}
            {activeSection === 'material' && 'JavaScript • Must return THREE.Material'}
            {activeSection === 'parameters' && 'JSON • Parameter definitions'}
          </div>
        </div>

        {/* Templates */}
        {(activeSection === 'geometry' || activeSection === 'material') && (
          <div className="mt-2">
            <div className="flex flex-wrap gap-1">
              <span className="text-xs text-gray-600 dark:text-gray-400 mr-2">Templates:</span>
              {Object.entries(activeSection === 'geometry' ? geometryTemplates : materialTemplates).map(([name, template]) => (
                <button
                  key={name}
                  onClick={() => insertTemplate(template)}
                  className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-800"
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Help panel */}
        {showHelp && (
          <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded text-xs text-blue-800 dark:text-blue-200">
            {activeSection === 'geometry' && (
              <div>
                <strong>Geometry Code Help:</strong>
                <ul className="mt-1 space-y-1 list-disc list-inside">
                  <li>Available variables: <code>THREE</code> (Three.js library), <code>parameters</code> (user inputs)</li>
                  <li>Must return a <code>THREE.BufferGeometry</code> or <code>THREE.Object3D</code></li>
                  <li>Access parameters like: <code>parameters.width</code>, <code>parameters.color</code></li>
                  <li>Use <code>|| defaultValue</code> for fallbacks: <code>parameters.size || 1</code></li>
                </ul>
              </div>
            )}
            {activeSection === 'material' && (
              <div>
                <strong>Material Code Help:</strong>
                <ul className="mt-1 space-y-1 list-disc list-inside">
                  <li>Available variables: <code>THREE</code>, <code>parameters</code></li>
                  <li>Must return a <code>THREE.Material</code></li>
                  <li>Common materials: <code>MeshStandardMaterial</code>, <code>MeshBasicMaterial</code>, <code>MeshPhysicalMaterial</code></li>
                  <li>Use parameters for dynamic properties: <code>color: parameters.color</code></li>
                </ul>
              </div>
            )}
            {activeSection === 'parameters' && (
              <div>
                <strong>Parameters JSON Help:</strong>
                <ul className="mt-1 space-y-1 list-disc list-inside">
                  <li>Define user-configurable parameters</li>
                  <li>Types: <code>number</code>, <code>string</code>, <code>boolean</code>, <code>color</code>, <code>select</code></li>
                  <li>Include <code>default</code>, <code>min/max</code> (for numbers), <code>description</code></li>
                  <li>Example: <code>{'{"size": {"type": "number", "default": 1, "min": 0.1}}'}</code></li>
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Editor */}
      <div className="flex-1 relative">
        <textarea
          ref={textareaRef}
          value={getCurrentCode()}
          onChange={(e) => {
            if (activeSection === 'parameters') {
              handleParametersChange(e.target.value);
            } else {
              handleCodeChange(activeSection, e.target.value);
            }
          }}
          className={`w-full h-full p-3 font-mono text-sm border-none resize-none focus:outline-none ${
            activeSection === 'parameters' 
              ? 'bg-gray-900 text-yellow-400' 
              : 'bg-gray-900 text-green-400'
          }`}
          style={{ tabSize: 2 }}
          placeholder={
            activeSection === 'geometry' 
              ? `// Write your Three.js geometry code here
// Available: THREE, parameters (object with user inputs)
// Must return a THREE.BufferGeometry or THREE.Object3D

const geometry = new THREE.BoxGeometry(
  parameters.width || 1,
  parameters.height || 1, 
  parameters.depth || 1
);

return geometry;`
              : activeSection === 'material'
              ? `// Optional custom material code
// Available: THREE, parameters
// Must return a THREE.Material

return new THREE.MeshStandardMaterial({
  color: parameters.color || '#1e88e5'
});`
              : `{
  "size": {
    "type": "number",
    "default": 1,
    "min": 0.1,
    "max": 10,
    "description": "Size of the element"
  },
  "color": {
    "type": "color",
    "default": "#1e88e5",
    "description": "Color of the element"
  }
}`
          }
        />

        {/* Line numbers overlay */}
        <div className="absolute left-0 top-0 w-12 h-full bg-gray-800 text-gray-500 text-xs font-mono pt-3 px-2 pointer-events-none select-none">
          {Array.from({ length: 50 }, (_, i) => (
            <div key={i} className="leading-5">
              {i + 1}
            </div>
          ))}
        </div>

        {/* Add left margin to textarea to account for line numbers */}
        <style jsx>{`
          textarea {
            padding-left: 3.5rem !important;
          }
        `}</style>
      </div>

      {/* Error display */}
      {errors.length > 0 && (
        <div className="p-2 bg-red-50 dark:bg-red-900/20 border-t border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs max-h-20 overflow-y-auto">
          {errors.map((error, i) => (
            <div key={i}>• {error}</div>
          ))}
        </div>
      )}

      {/* Status bar */}
      <div className="px-3 py-1 bg-gray-50 dark:bg-gray-700 border-t border-gray-200 dark:border-gray-600 text-xs text-gray-500 dark:text-gray-400">
        <div className="flex justify-between">
          <span>
            {activeSection === 'geometry' && 'Geometry Function'}
            {activeSection === 'material' && 'Material Function'}
            {activeSection === 'parameters' && 'Parameters Configuration'}
          </span>
          <span>
            Lines: {getCurrentCode().split('\n').length} | 
            Chars: {getCurrentCode().length}
          </span>
        </div>
      </div>
    </div>
  );
};

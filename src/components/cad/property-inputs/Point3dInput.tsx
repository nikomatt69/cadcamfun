// src/components/cad/property-inputs/Point3dInput.tsx
import React from 'react';

interface Point3d {
  x: number;
  y: number;
  z: number;
}

interface Point3dInputProps {
  label: string;
  value: Point3d;
  onChange: (value: Point3d) => void;
  disabled?: boolean;
  step?: number;
}

/**
 * Componente per modificare coordinate 3D (x, y, z)
 * 
 * @example
 * <Point3dInput
 *   label="Position"
 *   value={{ x: 0, y: 0, z: 0 }}
 *   onChange={(newPoint) => handleChange(newPoint)}
 *   step={0.1}
 * />
 */
export const Point3dInput: React.FC<Point3dInputProps> = ({
  label,
  value = { x: 0, y: 0, z: 0 },
  onChange,
  disabled = false,
  step = 0.1
}) => {
  const handleChange = (coord: 'x' | 'y' | 'z', newValue: string) => {
    const numericValue = newValue === '' ? 0 : parseFloat(newValue);
    const updatedValue = { ...value, [coord]: numericValue };
    onChange(updatedValue);
  };

  return (
    <div className="mb-2">
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="block text-xs text-gray-500 mb-1">X</label>
          <input
            type="number"
            value={value?.x ?? 0}
            onChange={(e) => handleChange('x', e.target.value)}
            disabled={disabled}
            className="w-full px-2 py-1 border border-gray-300 rounded-md shadow-sm text-xs focus:ring-blue-500 focus:border-blue-500"
            step={step}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Y</label>
          <input
            type="number"
            value={value?.y ?? 0}
            onChange={(e) => handleChange('y', e.target.value)}
            disabled={disabled}
            className="w-full px-2 py-1 border border-gray-300 rounded-md shadow-sm text-xs focus:ring-blue-500 focus:border-blue-500"
            step={step}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Z</label>
          <input
            type="number"
            value={value?.z ?? 0}
            onChange={(e) => handleChange('z', e.target.value)}
            disabled={disabled}
            className="w-full px-2 py-1 border border-gray-300 rounded-md shadow-sm text-xs focus:ring-blue-500 focus:border-blue-500"
            step={step}
          />
        </div>
      </div>
    </div>
  );
};
// src/components/cad/property-inputs/Vector3Input.tsx
import React from 'react';

interface Vector3 {
  x: number;
  y: number;
  z: number;
}

interface Vector3InputProps {
  label: string;
  value: Vector3;
  onChange: (value: Vector3) => void;
  disabled?: boolean;
  step?: number;
  unit?: string;
}

/**
 * Componente per modificare vettori 3D (x, y, z) con unità di misura
 * Utile per rotazioni, scale e altri vettori tridimensionali
 * 
 * @example
 * <Vector3Input
 *   label="Rotation"
 *   value={{ x: 0, y: 0, z: 0 }}
 *   onChange={(newVector) => handleChange(newVector)}
 *   step={1}
 *   unit="°"
 * />
 */
export const Vector3Input: React.FC<Vector3InputProps> = ({
  label,
  value = { x: 0, y: 0, z: 0 },
  onChange,
  disabled = false,
  step = 1,
  unit = '°'
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
          <label className="block text-xs text-gray-500 mb-1">X {unit}</label>
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
          <label className="block text-xs text-gray-500 mb-1">Y {unit}</label>
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
          <label className="block text-xs text-gray-500 mb-1">Z {unit}</label>
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
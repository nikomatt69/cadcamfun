// src/components/TransformControlPanel.tsx
import React, { useState, useCallback } from "react";
import { useTransformControls, useTransformConstraints } from "../hooks/useTransformControls";
import { useSelectionStore } from "../store/selectorStore";
import { 
  Move, 
  RotateCw, 
  Maximize2, 
  Lock, 
  Unlock, 
  Grid3X3, 
  Target,
  Settings,
  Copy,
  Trash2,
  Layers,
  AlignCenter,
  FlipHorizontal,
  FlipVertical
} from "lucide-react";

interface TransformControlPanelProps {
  className?: string;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const TransformControlPanel: React.FC<TransformControlPanelProps> = ({
  className = "",
  collapsed = false,
  onToggleCollapse
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [numericalMode, setNumericalMode] = useState(false);
  
  const {
    mode,
    isTransforming,
    selectedCount,
    canTransform,
    setMode,
    translateSelection,
    rotateSelection,
    scaleSelection,
    resetToOrigin,
    alignToGrid,
    duplicateInPlace,
    centerOnOrigin,
    distributeEvenly,
    toggleGizmo,
    setSnapMode,
    setConstraints
  } = useTransformControls();

  const { constraints, snapMode } = useTransformConstraints();
  const { selectedElementIds } = useSelectionStore();

  // Numerical input states
  const [translateValues, setTranslateValues] = useState({ x: 0, y: 0, z: 0 });
  const [rotateValues, setRotateValues] = useState({ x: 0, y: 0, z: 0 });
  const [scaleValues, setScaleValues] = useState({ x: 1, y: 1, z: 1 });

  const handleModeClick = useCallback((newMode: typeof mode) => {
    if (mode === newMode) {
      setMode("none");
    } else {
      setMode(newMode);
    }
  }, [mode, setMode]);

  const handleNumericalTransform = useCallback((type: "translate" | "rotate" | "scale") => {
    switch (type) {
      case "translate":
        translateSelection(translateValues);
        setTranslateValues({ x: 0, y: 0, z: 0 });
        break;
      case "rotate":
        rotateSelection(rotateValues);
        setRotateValues({ x: 0, y: 0, z: 0 });
        break;
      case "scale":
        scaleSelection(scaleValues);
        setScaleValues({ x: 1, y: 1, z: 1 });
        break;
    }
  }, [translateSelection, rotateSelection, scaleSelection, translateValues, rotateValues, scaleValues]);

  if (collapsed) {
    return (
      <div 
        className={`transform-control-panel collapsed ${className}`}
        style={{
          position: "fixed",
          top: "50%",
          right: "10px",
          transform: "translateY(-50%)",
          backgroundColor: "white",
          borderRadius: "8px",
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          padding: "8px",
          zIndex: 1000
        }}
      >
        <button
          onClick={onToggleCollapse}
          className="expand-button"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "4px"
          }}
        >
          <Settings size={20} />
        </button>
      </div>
    );
  }

  return (
    <div 
      className={`transform-control-panel ${className}`}
      style={{
        position: "fixed",
        top: "50%",
        right: "20px",
        transform: "translateY(-50%)",
        width: numericalMode ? "320px" : "280px",
        maxHeight: "80vh",
        overflowY: "auto",
        backgroundColor: "white",
        borderRadius: "12px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
        border: "1px solid #e5e7eb",
        zIndex: 1000
      }}
    >
      {/* Header */}
      <div 
        style={{
          padding: "16px 20px 12px",
          borderBottom: "1px solid #e5e7eb",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}
      >
        <h3 style={{ margin: 0, fontSize: "16px", fontWeight: "600", color: "#111827" }}>
          Transform Controls
        </h3>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={() => setNumericalMode(!numericalMode)}
            style={{
              background: numericalMode ? "#3b82f6" : "#f3f4f6",
              color: numericalMode ? "white" : "#6b7280",
              border: "none",
              borderRadius: "6px",
              padding: "6px",
              cursor: "pointer",
              fontSize: "12px"
            }}
            title="Toggle numerical input"
          >
            123
          </button>
          <button
            onClick={onToggleCollapse}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "4px",
              color: "#6b7280"
            }}
          >
            <Settings size={16} />
          </button>
        </div>
      </div>

      {/* Selection Info */}
      <div style={{ padding: "12px 20px", backgroundColor: "#f9fafb" }}>
        <div style={{ fontSize: "14px", color: "#6b7280" }}>
          {selectedCount === 0 ? "No elements selected" : 
           selectedCount === 1 ? "1 element selected" : 
           `${selectedCount} elements selected`}
        </div>
        {isTransforming && (
          <div style={{ fontSize: "12px", color: "#3b82f6", marginTop: "4px" }}>
            Transforming in {mode} mode
          </div>
        )}
      </div>

      {/* Transform Mode Buttons */}
      <div style={{ padding: "16px 20px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
          <button
            onClick={() => handleModeClick("translate")}
            disabled={!canTransform}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "4px",
              padding: "12px 8px",
              backgroundColor: mode === "translate" ? "#3b82f6" : "#f3f4f6",
              color: mode === "translate" ? "white" : "#6b7280",
              border: "none",
              borderRadius: "8px",
              cursor: canTransform ? "pointer" : "not-allowed",
              fontSize: "12px",
              opacity: canTransform ? 1 : 0.5
            }}
          >
            <Move size={16} />
            Move (G)
          </button>
          
          <button
            onClick={() => handleModeClick("rotate")}
            disabled={!canTransform}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "4px",
              padding: "12px 8px",
              backgroundColor: mode === "rotate" ? "#3b82f6" : "#f3f4f6",
              color: mode === "rotate" ? "white" : "#6b7280",
              border: "none",
              borderRadius: "8px",
              cursor: canTransform ? "pointer" : "not-allowed",
              fontSize: "12px",
              opacity: canTransform ? 1 : 0.5
            }}
          >
            <RotateCw size={16} />
            Rotate (R)
          </button>
          
          <button
            onClick={() => handleModeClick("scale")}
            disabled={!canTransform}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "4px",
              padding: "12px 8px",
              backgroundColor: mode === "scale" ? "#3b82f6" : "#f3f4f6",
              color: mode === "scale" ? "white" : "#6b7280",
              border: "none",
              borderRadius: "8px",
              cursor: canTransform ? "pointer" : "not-allowed",
              fontSize: "12px",
              opacity: canTransform ? 1 : 0.5
            }}
          >
            <Maximize2 size={16} />
            Scale (S)
          </button>
        </div>
      </div>

      {/* Numerical Inputs */}
      {numericalMode && canTransform && (
        <div style={{ padding: "0 20px 16px" }}>
          <div style={{ marginBottom: "16px" }}>
            <div style={{ fontSize: "14px", fontWeight: "500", marginBottom: "8px" }}>
              Translate
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
              {["x", "y", "z"].map(axis => (
                <div key={axis}>
                  <label style={{ fontSize: "12px", color: "#6b7280" }}>{axis.toUpperCase()}</label>
                  <input
                    type="number"
                    value={translateValues[axis as keyof typeof translateValues]}
                    onChange={(e) => setTranslateValues(prev => ({
                      ...prev,
                      [axis]: parseFloat(e.target.value) || 0
                    }))}
                    style={{
                      width: "100%",
                      padding: "6px 8px",
                      border: "1px solid #d1d5db",
                      borderRadius: "4px",
                      fontSize: "12px"
                    }}
                    step="0.1"
                  />
                </div>
              ))}
            </div>
            <button
              onClick={() => handleNumericalTransform("translate")}
              style={{
                width: "100%",
                marginTop: "8px",
                padding: "6px 12px",
                backgroundColor: "#3b82f6",
                color: "white",
                border: "none",
                borderRadius: "4px",
                fontSize: "12px",
                cursor: "pointer"
              }}
            >
              Apply Translation
            </button>
          </div>

          <div style={{ marginBottom: "16px" }}>
            <div style={{ fontSize: "14px", fontWeight: "500", marginBottom: "8px" }}>
              Rotate (degrees)
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
              {["x", "y", "z"].map(axis => (
                <div key={axis}>
                  <label style={{ fontSize: "12px", color: "#6b7280" }}>{axis.toUpperCase()}</label>
                  <input
                    type="number"
                    value={rotateValues[axis as keyof typeof rotateValues]}
                    onChange={(e) => setRotateValues(prev => ({
                      ...prev,
                      [axis]: parseFloat(e.target.value) || 0
                    }))}
                    style={{
                      width: "100%",
                      padding: "6px 8px",
                      border: "1px solid #d1d5db",
                      borderRadius: "4px",
                      fontSize: "12px"
                    }}
                    step="1"
                  />
                </div>
              ))}
            </div>
            <button
              onClick={() => handleNumericalTransform("rotate")}
              style={{
                width: "100%",
                marginTop: "8px",
                padding: "6px 12px",
                backgroundColor: "#3b82f6",
                color: "white",
                border: "none",
                borderRadius: "4px",
                fontSize: "12px",
                cursor: "pointer"
              }}
            >
              Apply Rotation
            </button>
          </div>

          <div style={{ marginBottom: "16px" }}>
            <div style={{ fontSize: "14px", fontWeight: "500", marginBottom: "8px" }}>
              Scale (factor)
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
              {["x", "y", "z"].map(axis => (
                <div key={axis}>
                  <label style={{ fontSize: "12px", color: "#6b7280" }}>{axis.toUpperCase()}</label>
                  <input
                    type="number"
                    value={scaleValues[axis as keyof typeof scaleValues]}
                    onChange={(e) => setScaleValues(prev => ({
                      ...prev,
                      [axis]: parseFloat(e.target.value) || 1
                    }))}
                    style={{
                      width: "100%",
                      padding: "6px 8px",
                      border: "1px solid #d1d5db",
                      borderRadius: "4px",
                      fontSize: "12px"
                    }}
                    step="0.1"
                    min="0.1"
                  />
                </div>
              ))}
            </div>
            <button
              onClick={() => handleNumericalTransform("scale")}
              style={{
                width: "100%",
                marginTop: "8px",
                padding: "6px 12px",
                backgroundColor: "#3b82f6",
                color: "white",
                border: "none",
                borderRadius: "4px",
                fontSize: "12px",
                cursor: "pointer"
              }}
            >
              Apply Scale
            </button>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      {canTransform && (
        <div style={{ padding: "0 20px 16px" }}>
          <div style={{ fontSize: "14px", fontWeight: "500", marginBottom: "12px" }}>
            Quick Actions
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            <button
              onClick={resetToOrigin}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 12px",
                backgroundColor: "#f3f4f6",
                border: "none",
                borderRadius: "6px",
                fontSize: "12px",
                cursor: "pointer"
              }}
            >
              <Target size={14} />
              Reset Position
            </button>
            
            <button
              onClick={alignToGrid}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 12px",
                backgroundColor: "#f3f4f6",
                border: "none",
                borderRadius: "6px",
                fontSize: "12px",
                cursor: "pointer"
              }}
            >
              <Grid3X3 size={14} />
              Align to Grid
            </button>
            
            <button
              onClick={duplicateInPlace}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 12px",
                backgroundColor: "#f3f4f6",
                border: "none",
                borderRadius: "6px",
                fontSize: "12px",
                cursor: "pointer"
              }}
            >
              <Copy size={14} />
              Duplicate
            </button>
            
            <button
              onClick={centerOnOrigin}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "8px 12px",
                backgroundColor: "#f3f4f6",
                border: "none",
                borderRadius: "6px",
                fontSize: "12px",
                cursor: "pointer"
              }}
            >
              <AlignCenter size={14} />
              Center
            </button>
          </div>

          {selectedCount > 2 && (
            <div style={{ marginTop: "12px" }}>
              <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "8px" }}>
                Distribute Elements
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px" }}>
                <button
                  onClick={() => distributeEvenly("x")}
                  style={{
                    padding: "6px 8px",
                    backgroundColor: "#f3f4f6",
                    border: "none",
                    borderRadius: "4px",
                    fontSize: "11px",
                    cursor: "pointer"
                  }}
                >
                  X Axis
                </button>
                <button
                  onClick={() => distributeEvenly("y")}
                  style={{
                    padding: "6px 8px",
                    backgroundColor: "#f3f4f6",
                    border: "none",
                    borderRadius: "4px",
                    fontSize: "11px",
                    cursor: "pointer"
                  }}
                >
                  Y Axis
                </button>
                <button
                  onClick={() => distributeEvenly("z")}
                  style={{
                    padding: "6px 8px",
                    backgroundColor: "#f3f4f6",
                    border: "none",
                    borderRadius: "4px",
                    fontSize: "11px",
                    cursor: "pointer"
                  }}
                >
                  Z Axis
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Constraints and Snapping */}
      <div style={{ padding: "0 20px 16px" }}>
        <div style={{ fontSize: "14px", fontWeight: "500", marginBottom: "12px" }}>
          Constraints & Snapping
        </div>
        
        <div style={{ marginBottom: "12px" }}>
          <label style={{ fontSize: "12px", color: "#6b7280", marginBottom: "6px", display: "block" }}>
            Snap Mode
          </label>
          <select
            value={snapMode}
            onChange={(e) => setSnapMode(e.target.value as any)}
            style={{
              width: "100%",
              padding: "6px 8px",
              border: "1px solid #d1d5db",
              borderRadius: "4px",
              fontSize: "12px"
            }}
          >
            <option value="none">No Snapping</option>
            <option value="grid">Grid</option>
            <option value="vertex">Vertex</option>
            <option value="edge">Edge</option>
            <option value="center">Center</option>
            <option value="angle">Angle</option>
          </select>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px" }}>
            <input
              type="checkbox"
              checked={constraints.lockX}
              onChange={(e) => setConstraints({ lockX: e.target.checked })}
            />
            Lock X
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px" }}>
            <input
              type="checkbox"
              checked={constraints.lockY}
              onChange={(e) => setConstraints({ lockY: e.target.checked })}
            />
            Lock Y
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px" }}>
            <input
              type="checkbox"
              checked={constraints.lockZ}
              onChange={(e) => setConstraints({ lockZ: e.target.checked })}
            />
            Lock Z
          </label>
        </div>

        <div style={{ marginTop: "12px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px" }}>
            <input
              type="checkbox"
              checked={constraints.preserveAspectRatio}
              onChange={(e) => setConstraints({ preserveAspectRatio: e.target.checked })}
            />
            Preserve Aspect Ratio
          </label>
        </div>
      </div>

      {/* Advanced Settings */}
      {showAdvanced && (
        <div style={{ padding: "0 20px 20px", borderTop: "1px solid #e5e7eb", paddingTop: "16px" }}>
          <div style={{ fontSize: "14px", fontWeight: "500", marginBottom: "12px" }}>
            Advanced Settings
          </div>
          
          <div style={{ marginBottom: "12px" }}>
            <label style={{ fontSize: "12px", color: "#6b7280", marginBottom: "6px", display: "block" }}>
              Snap Distance
            </label>
            <input
              type="number"
              value={constraints.snapDistance}
              onChange={(e) => setConstraints({ snapDistance: parseFloat(e.target.value) || 10 })}
              style={{
                width: "100%",
                padding: "6px 8px",
                border: "1px solid #d1d5db",
                borderRadius: "4px",
                fontSize: "12px"
              }}
              min="1"
              step="1"
            />
          </div>

          <div style={{ marginBottom: "12px" }}>
            <label style={{ fontSize: "12px", color: "#6b7280", marginBottom: "6px", display: "block" }}>
              Angle Step (degrees)
            </label>
            <input
              type="number"
              value={constraints.angleStep}
              onChange={(e) => setConstraints({ angleStep: parseFloat(e.target.value) || 15 })}
              style={{
                width: "100%",
                padding: "6px 8px",
                border: "1px solid #d1d5db",
                borderRadius: "4px",
                fontSize: "12px"
              }}
              min="1"
              max="90"
              step="1"
            />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            <div>
              <label style={{ fontSize: "12px", color: "#6b7280", marginBottom: "6px", display: "block" }}>
                Min Scale
              </label>
              <input
                type="number"
                value={constraints.minScale}
                onChange={(e) => setConstraints({ minScale: parseFloat(e.target.value) || 0.1 })}
                style={{
                  width: "100%",
                  padding: "6px 8px",
                  border: "1px solid #d1d5db",
                  borderRadius: "4px",
                  fontSize: "12px"
                }}
                min="0.01"
                max="1"
                step="0.1"
              />
            </div>
            <div>
              <label style={{ fontSize: "12px", color: "#6b7280", marginBottom: "6px", display: "block" }}>
                Max Scale
              </label>
              <input
                type="number"
                value={constraints.maxScale}
                onChange={(e) => setConstraints({ maxScale: parseFloat(e.target.value) || 10 })}
                style={{
                  width: "100%",
                  padding: "6px 8px",
                  border: "1px solid #d1d5db",
                  borderRadius: "4px",
                  fontSize: "12px"
                }}
                min="1"
                max="100"
                step="1"
              />
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{ padding: "12px 20px", borderTop: "1px solid #e5e7eb" }}>
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          style={{
            width: "100%",
            padding: "8px 12px",
            backgroundColor: "transparent",
            border: "1px solid #d1d5db",
            borderRadius: "6px",
            fontSize: "12px",
            cursor: "pointer",
            color: "#6b7280"
          }}
        >
          {showAdvanced ? "Hide" : "Show"} Advanced Settings
        </button>
      </div>
    </div>
  );
};

export default TransformControlPanel;

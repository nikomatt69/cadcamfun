// src/components/TransformGizmo.tsx
import * as React from "react";
import { useTransformGizmo, useTransformControls } from "../hooks/useTransformControls";
import { useSelectionStore } from "../store/selectorStore";
import { useCADStore } from "../store/cadStore";
import { worldToScreen } from "../lib/cad/utils/transformUtils";

interface TransformGizmoProps {
  canvasRef?: React.RefObject<HTMLCanvasElement>;
  camera?: THREE.Camera;
  className?: string;
  style?: React.CSSProperties;
}

export const TransformGizmo: React.FC<TransformGizmoProps> = ({
  canvasRef,
  camera,
  className = "",
  style = {}
}) => {
  const gizmoRef = React.useRef<HTMLDivElement>(null);
  const { visible, handles, settings } = useTransformGizmo();
  const { mode, isTransforming, onMouseDown, onMouseMove, onMouseUp } = useTransformControls();
  const { selectedElementIds } = useSelectionStore();
  const { viewMode } = useCADStore();
  const selectionStore = useSelectionStore();

  // Fixed position in bottom-left corner, near keyboard shortcuts button
  const gizmoPosition = React.useMemo(() => {
    if (selectedElementIds.length === 0) {
      return null;
    }

    // Fixed position in bottom-left area
    return {
      x: 200, // 80px from left edge (next to keyboard shortcuts button)
      y: window.innerHeight - 120 // 120px from bottom
    };
  }, [selectedElementIds]);

  // Handle mouse events
  React.useEffect(() => {
    const gizmoElement = gizmoRef.current;
    if (!gizmoElement) return;

    const handleMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Find which handle was clicked
      const target = e.target as HTMLElement;
      const axis = target.dataset.axis;

      if (axis) {
        // Store initial mouse position and axis for transform operation
        gizmoElement.dataset.transformAxis = axis;
        gizmoElement.dataset.mouseStartX = e.clientX.toString();
        gizmoElement.dataset.mouseStartY = e.clientY.toString();
      }

      onMouseDown(e);
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (isTransforming && gizmoElement.dataset.transformAxis) {
        e.preventDefault();

        // Calculate mouse delta
        const startX = parseInt(gizmoElement.dataset.mouseStartX || '0');
        const startY = parseInt(gizmoElement.dataset.mouseStartY || '0');
        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;

        // Update visual feedback
        const transformInfo = gizmoElement.querySelector('.transform-info');
        if (transformInfo) {
          const valuesDiv = transformInfo.querySelector('.transform-values') as HTMLElement;
          if (valuesDiv) {
            const axis = gizmoElement.dataset.transformAxis;
            valuesDiv.textContent = `${axis?.toUpperCase()}: ${deltaX.toFixed(1)}, ${(-deltaY).toFixed(1)}`;
          }
        }

        onMouseMove(e);
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (isTransforming) {
        e.preventDefault();

        // Clear transform data
        delete gizmoElement.dataset.transformAxis;
        delete gizmoElement.dataset.mouseStartX;
        delete gizmoElement.dataset.mouseStartY;

        onMouseUp(e);
      }
    };

    gizmoElement.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      gizmoElement.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isTransforming, onMouseDown, onMouseMove, onMouseUp]);

  // Don't render if no elements selected, gizmo is hidden, or position can't be calculated
  if (!visible || selectedElementIds.length === 0 || mode === "none" || !gizmoPosition) {
    return null;
  }

  const renderTranslateGizmo = () => (
    <div className="transform-gizmo translate-gizmo">
      {/* X Axis Arrow */}
      <div
        className="gizmo-handle gizmo-arrow x-axis"
        style={{
          position: "absolute",
          width: `${settings.size}px`,
          height: "4px",
          backgroundColor: settings.colors.x,
          cursor: "ew-resize",
          opacity: settings.opacity,
          transform: "translateY(-50%)",
          transition: "opacity 0.2s ease"
        }}
        data-axis="x"
        onMouseEnter={(e) => {
          e.currentTarget.style.opacity = "1";
          e.currentTarget.style.transform = "translateY(-50%) scale(1.1)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity = settings.opacity.toString();
          e.currentTarget.style.transform = "translateY(-50%) scale(1)";
        }}
      >
        <div
          className="arrow-head"
          style={{
            position: "absolute",
            right: "-8px",
            top: "-4px",
            width: "0",
            height: "0",
            borderLeft: "8px solid " + settings.colors.x,
            borderTop: "6px solid transparent",
            borderBottom: "6px solid transparent",
            pointerEvents: "none"
          }}
        />
        {settings.showLabels && (
          <span
            className="axis-label"
            style={{
              position: "absolute",
              right: "-24px",
              top: "-12px",
              fontSize: "12px",
              color: settings.colors.x,
              fontWeight: "bold",
              pointerEvents: "none",
              textShadow: "1px 1px 2px rgba(0,0,0,0.8)"
            }}
          >
            X
          </span>
        )}
      </div>

      {/* Y Axis Arrow */}
      <div
        className="gizmo-handle gizmo-arrow y-axis"
        style={{
          position: "absolute",
          width: "4px",
          height: `${settings.size}px`,
          backgroundColor: settings.colors.y,
          cursor: "ns-resize",
          opacity: settings.opacity,
          transform: "translateX(-50%)",
          transition: "opacity 0.2s ease"
        }}
        data-axis="y"
        onMouseEnter={(e) => {
          e.currentTarget.style.opacity = "1";
          e.currentTarget.style.transform = "translateX(-50%) scale(1.1)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity = settings.opacity.toString();
          e.currentTarget.style.transform = "translateX(-50%) scale(1)";
        }}
      >
        <div
          className="arrow-head"
          style={{
            position: "absolute",
            top: "-8px",
            left: "-4px",
            width: "0",
            height: "0",
            borderBottom: "8px solid " + settings.colors.y,
            borderLeft: "6px solid transparent",
            borderRight: "6px solid transparent",
            pointerEvents: "none"
          }}
        />
        {settings.showLabels && (
          <span
            className="axis-label"
            style={{
              position: "absolute",
              top: "-24px",
              left: "-8px",
              fontSize: "12px",
              color: settings.colors.y,
              fontWeight: "bold",
              pointerEvents: "none",
              textShadow: "1px 1px 2px rgba(0,0,0,0.8)"
            }}
          >
            Y
          </span>
        )}
      </div>

      {/* Z Axis Arrow (for 3D mode) */}
      {viewMode === "3d" && (
        <div
          className="gizmo-handle gizmo-arrow z-axis"
          style={{
            position: "absolute",
            width: "4px",
            height: `${settings.size * 0.7}px`,
            backgroundColor: settings.colors.z,
            cursor: "ns-resize",
            opacity: settings.opacity,
            transform: "translateX(-50%) rotate(45deg)",
            transformOrigin: "bottom",
            transition: "opacity 0.2s ease"
          }}
          data-axis="z"
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = "1";
            e.currentTarget.style.transform = "translateX(-50%) rotate(45deg) scale(1.1)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = settings.opacity.toString();
            e.currentTarget.style.transform = "translateX(-50%) rotate(45deg) scale(1)";
          }}
        >
          <div
            className="arrow-head"
            style={{
              position: "absolute",
              top: "-8px",
              left: "-4px",
              width: "0",
              height: "0",
              borderBottom: "8px solid " + settings.colors.z,
              borderLeft: "6px solid transparent",
              borderRight: "6px solid transparent",
              pointerEvents: "none"
            }}
          />
          {settings.showLabels && (
            <span
              className="axis-label"
              style={{
                position: "absolute",
                top: "-24px",
                left: "-8px",
                fontSize: "12px",
                color: settings.colors.z,
                fontWeight: "bold",
                transform: "rotate(-45deg)",
                pointerEvents: "none",
                textShadow: "1px 1px 2px rgba(0,0,0,0.8)"
              }}
            >
              Z
            </span>
          )}
        </div>
      )}

      {/* Center Handle */}
      <div
        className="gizmo-handle gizmo-center"
        style={{
          position: "absolute",
          width: "12px",
          height: "12px",
          backgroundColor: settings.colors.selection,
          border: "2px solid white",
          borderRadius: "50%",
          cursor: "move",
          transform: "translate(-50%, -50%)",
          opacity: settings.opacity,
          transition: "all 0.2s ease"
        }}
        data-axis="xyz"
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "translate(-50%, -50%) scale(1.2)";
          e.currentTarget.style.boxShadow = "0 0 10px rgba(255, 170, 0, 0.8)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "translate(-50%, -50%) scale(1)";
          e.currentTarget.style.boxShadow = "none";
        }}
      />
    </div>
  );

  const renderRotateGizmo = () => (
    <div className="transform-gizmo rotate-gizmo">
      {/* X Rotation Ring */}
      <div
        className="gizmo-handle gizmo-ring x-ring"
        style={{
          position: "absolute",
          width: `${settings.size}px`,
          height: `${settings.size}px`,
          borderRadius: "50%",
          border: `3px solid ${settings.colors.x}`,
          cursor: "grab",
          opacity: settings.opacity,
          transform: "translate(-50%, -50%) rotateY(90deg)",
          transition: "all 0.2s ease"
        }}
        data-axis="x"
        onMouseEnter={(e) => {
          e.currentTarget.style.opacity = "1";
          e.currentTarget.style.borderWidth = "4px";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity = settings.opacity.toString();
          e.currentTarget.style.borderWidth = "3px";
        }}
      />

      {/* Y Rotation Ring */}
      <div
        className="gizmo-handle gizmo-ring y-ring"
        style={{
          position: "absolute",
          width: `${settings.size}px`,
          height: `${settings.size}px`,
          borderRadius: "50%",
          border: `3px solid ${settings.colors.y}`,
          cursor: "grab",
          opacity: settings.opacity,
          transform: "translate(-50%, -50%) rotateX(90deg)",
          transition: "all 0.2s ease"
        }}
        data-axis="y"
        onMouseEnter={(e) => {
          e.currentTarget.style.opacity = "1";
          e.currentTarget.style.borderWidth = "4px";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity = settings.opacity.toString();
          e.currentTarget.style.borderWidth = "3px";
        }}
      />

      {/* Z Rotation Ring */}
      <div
        className="gizmo-handle gizmo-ring z-ring"
        style={{
          position: "absolute",
          width: `${settings.size}px`,
          height: `${settings.size}px`,
          borderRadius: "50%",
          border: `3px solid ${settings.colors.z}`,
          cursor: "grab",
          opacity: settings.opacity,
          transform: "translate(-50%, -50%)",
          transition: "all 0.2s ease"
        }}
        data-axis="z"
        onMouseEnter={(e) => {
          e.currentTarget.style.opacity = "1";
          e.currentTarget.style.borderWidth = "4px";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity = settings.opacity.toString();
          e.currentTarget.style.borderWidth = "3px";
        }}
      />

      {/* Center Dot */}
      <div
        className="gizmo-center"
        style={{
          position: "absolute",
          width: "8px",
          height: "8px",
          backgroundColor: settings.colors.selection,
          borderRadius: "50%",
          transform: "translate(-50%, -50%)",
          pointerEvents: "none"
        }}
      />
    </div>
  );

  const renderScaleGizmo = () => (
    <div className="transform-gizmo scale-gizmo">
      {/* Corner handles for uniform scaling */}
      {[
        { x: -1, y: -1, cursor: "nw-resize" },
        { x: 1, y: -1, cursor: "ne-resize" },
        { x: -1, y: 1, cursor: "sw-resize" },
        { x: 1, y: 1, cursor: "se-resize" }
      ].map((corner, index) => (
        <div
          key={`corner-${index}`}
          className="gizmo-handle gizmo-scale-corner"
          style={{
            position: "absolute",
            width: "8px",
            height: "8px",
            backgroundColor: settings.colors.selection,
            border: "2px solid white",
            borderRadius: "2px",
            cursor: corner.cursor,
            transform: "translate(-50%, -50%)",
            left: `${50 + corner.x * 40}%`,
            top: `${50 + corner.y * 40}%`,
            transition: "all 0.2s ease"
          }}
          data-axis="xyz"
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "translate(-50%, -50%) scale(1.3)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "translate(-50%, -50%) scale(1)";
          }}
        />
      ))}

      {/* Edge handles for axis scaling */}
      {/* X Axis handles */}
      {[-1, 1].map((side, index) => (
        <div
          key={`x-${index}`}
          className="gizmo-handle gizmo-scale-edge"
          style={{
            position: "absolute",
            width: "8px",
            height: "8px",
            backgroundColor: settings.colors.x,
            border: "2px solid white",
            borderRadius: "2px",
            cursor: "ew-resize",
            transform: "translate(-50%, -50%)",
            left: `${50 + side * 40}%`,
            top: "50%",
            transition: "all 0.2s ease"
          }}
          data-axis="x"
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "translate(-50%, -50%) scale(1.3)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "translate(-50%, -50%) scale(1)";
          }}
        />
      ))}

      {/* Y Axis handles */}
      {[-1, 1].map((side, index) => (
        <div
          key={`y-${index}`}
          className="gizmo-handle gizmo-scale-edge"
          style={{
            position: "absolute",
            width: "8px",
            height: "8px",
            backgroundColor: settings.colors.y,
            border: "2px solid white",
            borderRadius: "2px",
            cursor: "ns-resize",
            transform: "translate(-50%, -50%)",
            left: "50%",
            top: `${50 + side * 40}%`,
            transition: "all 0.2s ease"
          }}
          data-axis="y"
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "translate(-50%, -50%) scale(1.3)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "translate(-50%, -50%) scale(1)";
          }}
        />
      ))}

      {/* Center handle */}
      <div
        className="gizmo-center"
        style={{
          position: "absolute",
          width: "12px",
          height: "12px",
          backgroundColor: settings.colors.selection,
          border: "2px solid white",
          borderRadius: "50%",
          transform: "translate(-50%, -50%)",
          left: "50%",
          top: "50%",
          pointerEvents: "none"
        }}
      />
    </div>
  );

  const renderGizmo = () => {
    switch (mode) {
      case "translate":
        return renderTranslateGizmo();
      case "rotate":
        return renderRotateGizmo();
      case "scale":
        return renderScaleGizmo();
      default:
        return null;
    }
  };

  return (
    <div
      ref={gizmoRef}
      className={`transform-gizmo-container ${className}`}
      style={{
        position: "fixed",
        left: gizmoPosition.x,
        top: gizmoPosition.y,
        pointerEvents: "auto",
        zIndex: 1000,
        userSelect: "none",
        backgroundColor: "rgba(30, 30, 30, 0.9)",
        borderRadius: "12px",
        padding: "12px",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        backdropFilter: "blur(8px)",
        boxShadow: "0 4px 20px rgba(0, 0, 0, 0.3)",
        ...style
      }}
    >
      <div
        style={{
          position: "relative",
          width: "60px",
          height: "60px"
        }}
      >
        {renderGizmo()}
      </div>

      {/* Transform info display */}
      {isTransforming && (
        <div
          className="transform-info"
          style={{
            position: "absolute",
            top: "-50px",
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: "rgba(0, 0, 0, 0.9)",
            color: "white",
            padding: "6px 12px",
            borderRadius: "6px",
            fontSize: "12px",
            whiteSpace: "nowrap",
            border: "1px solid rgba(255, 255, 255, 0.2)",
            backdropFilter: "blur(4px)"
          }}
        >
          <div style={{ fontWeight: "bold", marginBottom: "2px" }}>
            {mode.toUpperCase()}
          </div>
          <div className="transform-values" style={{ fontSize: "10px", color: "#ccc" }}>
            {mode === "translate" && "Move with mouse or type values"}
            {mode === "rotate" && "Rotate with mouse or type angle"}
            {mode === "scale" && "Scale with mouse or type values"}
          </div>
        </div>
      )}
    </div>
  );
};

export default TransformGizmo;

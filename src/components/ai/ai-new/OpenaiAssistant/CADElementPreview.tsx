import React from "react";
import { AIAction } from "@/src/types/AITypes";
import { Box, Cylinder, Dot, Minus, Pyramid, Torus } from "lucide-react";

interface CADElementPreviewProps {
  action: AIAction;
}

export const CADElementPreview: React.FC<CADElementPreviewProps> = ({ action }) => {
  if (action.type !== "generateCADElement" || !action.payload.elements) {
    return null;
  }
  const PrismIcon = () => (
    <svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
      <polygon points="12,2 20,7 20,17 12,22 4,17 4,7" />
    </svg>
  );

  const HemisphereIcon = () => (
    <svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12,12 C16.4183,12 20,8.41828 20,4 C20,-0.418278 16.4183,-4 12,-4 C7.58172,-4 4,-0.418278 4,4 C4,8.41828 7.58172,12 12,12 Z" />
      <line x1="4" y1="4" x2="20" y2="4" />
    </svg>
  );

  const EllipsoidIcon = () => (
    <svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
      <ellipse cx="12" cy="12" rx="8" ry="5" />
    </svg>
  );

  const CapsuleIcon = () => (
    <svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12,20 L12,4" />
      <path d="M7,4 A5,5 0 0 1 17,4" />
      <path d="M7,20 A5,5 0 0 0 17,20" />
    </svg>
  );

  const EllipseIcon = () => (
    <svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
      <ellipse cx="12" cy="12" rx="10" ry="6" />
    </svg>
  );

  return (
    <div className="mt-3 bg-gradient-to-br from-green-50/70 to-emerald-50/70 dark:from-green-900/30 dark:to-emerald-900/30 backdrop-blur-xl border border-green-200/50 dark:border-green-700/50 rounded-xl p-4 shadow-lg">
      <div className="flex items-center space-x-2 mb-3">
        <div className="w-2 h-2 bg-gradient-to-r from-green-400 to-emerald-500 rounded-full"></div>
        <h4 className="text-sm font-semibold text-green-700 dark:text-green-400">
          Elements to be created
      </h4>
        <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded-full text-xs font-medium">
          {action.payload.elements.length}
        </span>
      </div>
      <div className="max-h-48 overflow-y-auto space-y-2">
        {action.payload.elements.map((element: any, index: number) => (
          <div
            key={index}
            className="flex items-center p-3 bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm rounded-lg border border-green-200/50 dark:border-green-700/50 shadow-md"
          >
            {/* Element icon based on type */}
            <div className="mr-3 p-2 bg-green-100/70 dark:bg-green-800/70 rounded-lg text-green-600 dark:text-green-400 backdrop-blur-sm">
              {element.type === "cube" && <Box size={16} />}
              {element.type === "sphere" && <Circle size={16} />}
              {element.type === "cylinder" && <Cylinder size={16} />}
              {element.type === "cone" && <Triangle size={16} />}
              {element.type === "torus" && <Torus size={16} />}
              {element.type === "pyramid" && <Pyramid size={16} />}
              {element.type === "prism" && <PrismIcon />}
              {element.type === "line" && <Minus size={16} />}
              {element.type === "hemisphere" && <HemisphereIcon />}
              {element.type === "ellipsoid" && <EllipsoidIcon />}
              {element.type === "capsule" && <CapsuleIcon />}
              {element.type === "ellipse" && <EllipseIcon />}
              {!["cube", "sphere", "cylinder", "cone", "ellipse", "prism", "hemisphere", "pyramid", "torus"].includes(
                element.type
              ) && <Box size={16} />}
            </div>

            {/* Color preview */}
            <div 
              className="w-5 h-5 rounded-lg mr-3 border border-gray-200/50 dark:border-gray-700/50 shadow-sm" 
              style={{ backgroundColor: element.color || "#1e88e5" }} 
            />

            {/* Element info */}
            <div className="flex-1">
              <div className="flex items-center space-x-1 mb-1">
                <div className="text-sm font-semibold capitalize text-gray-700 dark:text-gray-200">{element.type}</div>
                <div className="w-1 h-1 bg-gray-400 rounded-full"></div>
                <div className="text-xs text-gray-500 dark:text-gray-400 font-medium">
              {element.type === "cube" && (
                <span>
                  {element.width || 50}×{element.height || 50}×{element.depth || 50}
                </span>
              )}
              {["sphere", "cylinder", "cone"].includes(element.type) && <span>r: {element.radius || 25}</span>}
              {element.type === "cylinder" && <span>, h: {element.height || 50}</span>}
                </div>
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50/70 dark:bg-gray-800/70 px-2 py-1 rounded-md backdrop-blur-sm">
                Position: ({Math.round(element.x || 0)}, {Math.round(element.y || 0)}, {Math.round(element.z || 0)})
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Simple shape components for icons
const Circle: React.FC<{ size: number }> = ({ size }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: "50%",
      border: "1.5px solid currentColor"
    }}
  />
);

const Triangle: React.FC<{ size: number }> = ({ size }) => (
  <div
    style={{
      width: 0,
      height: 0,
      borderLeft: `${size / 2}px solid transparent`,
      borderRight: `${size / 2}px solid transparent`,
      borderBottom: `${size}px solid currentColor`
    }}
  />
);

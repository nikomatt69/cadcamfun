// 3DPrinterIntegration.tsx
import React, { useState } from "react";

// This component handles state management for 3D printer settings
// to be shared between the ToolpathGenerator and render3DPrinterSection components

interface PrinterSettingsState {
  infillDensity: number;
  infillPattern: "grid" | "lines" | "triangles" | "honeycomb";
  supportType: "none" | "minimal" | "full";
  shellCount: number;
  printResolution: "standard" | "high" | "low";
  printOrientation: "original" | "auto-optimal";
}

interface PrinterIntegrationOutput extends PrinterSettingsState {
  setInfillDensity: (value: number) => void;
  setInfillPattern: (value: "grid" | "lines" | "triangles" | "honeycomb") => void;
  setSupportType: (value: "none" | "minimal" | "full") => void;
  setShellCount: (value: number) => void;
  setPrintResolution: (value: "standard" | "high" | "low") => void;
  setPrintOrientation: (value: "original" | "auto-optimal") => void;
}

// Hook to be used in ToolpathGenerator
export function use3DPrinterSettings(): PrinterIntegrationOutput {
  const [infillDensity, setInfillDensity] = useState<number>(20);
  const [infillPattern, setInfillPattern] = useState<"grid" | "lines" | "triangles" | "honeycomb">("grid");
  const [supportType, setSupportType] = useState<"none" | "minimal" | "full">("minimal");
  const [shellCount, setShellCount] = useState<number>(2);
  const [printResolution, setPrintResolution] = useState<"standard" | "high" | "low">("standard");
  const [printOrientation, setPrintOrientation] = useState<"original" | "auto-optimal">("original");

  return {
    infillDensity,
    setInfillDensity,
    infillPattern,
    setInfillPattern,
    supportType,
    setSupportType,
    shellCount,
    setShellCount,
    printResolution,
    setPrintResolution,
    printOrientation,
    setPrintOrientation
  };
}

export default use3DPrinterSettings;

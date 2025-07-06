import React, { useEffect, useRef } from "react";
import { extractElementDimensions } from "./3DPrinterToolpathHelpers";

interface PrinterPreviewProps {
  element: any;
  settings: any;
  infillDensity: number;
  shellCount: number;
  supportType: "none" | "minimal" | "full";
  infillPattern: "grid" | "lines" | "triangles" | "honeycomb";
}

const PrinterPreview: React.FC<PrinterPreviewProps> = ({
  element,
  settings,
  infillDensity,
  shellCount,
  supportType,
  infillPattern
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Create visualization when element or settings change
  useEffect(() => {
    if (!element || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Extract dimensions
    const { width, height, depth } = extractElementDimensions(element);

    // Scale factor to fit in canvas
    const maxDimension = Math.max(width, height, depth);
    const scale = (Math.min(canvas.width, canvas.height) * 0.8) / maxDimension;

    // Center position
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    // Draw element based on type
    ctx.save();
    ctx.translate(centerX, centerY);

    // Draw build plate
    ctx.fillStyle = "rgba(200, 200, 200, 0.3)";
    ctx.fillRect(-canvas.width / 2, -10, canvas.width, 10);
    ctx.strokeStyle = "rgba(100, 100, 100, 0.5)";
    ctx.strokeRect(-canvas.width / 2, -10, canvas.width, 10);

    // Draw element preview based on type
    drawElementPreview(ctx, element, scale);

    // Draw representation of settings
    drawSettingsPreview(ctx, element, scale, {
      infillDensity,
      shellCount,
      supportType,
      infillPattern,
      layerHeight: settings.layerHeight || 0.2
    });

    ctx.restore();
  }, [element, settings, infillDensity, shellCount, supportType, infillPattern]);

  // Helper function to draw element preview
  const drawElementPreview = (ctx: CanvasRenderingContext2D, element: any, scale: number) => {
    if (!element) return;

    ctx.lineWidth = 2;
    ctx.strokeStyle = "#4F83ED";

    switch (element.type) {
      case "cube":
        drawCubePreview(ctx, element, scale);
        break;
      case "sphere":
        drawSpherePreview(ctx, element, scale);
        break;
      case "cylinder":
        drawCylinderPreview(ctx, element, scale);
        break;
      case "cone":
        drawConePreview(ctx, element, scale);
        break;
      case "rectangle":
        drawRectanglePreview(ctx, element, scale);
        break;
      case "circle":
        drawCirclePreview(ctx, element, scale);
        break;
      case "polygon":
        drawPolygonPreview(ctx, element, scale);
        break;
      default:
        // Draw bounding box for unsupported elements
        const { width, height } = extractElementDimensions(element);
        ctx.strokeRect((-width * scale) / 2, (-height * scale) / 2, width * scale, height * scale);
        ctx.fillStyle = "rgba(79, 131, 237, 0.2)";
        ctx.fillRect((-width * scale) / 2, (-height * scale) / 2, width * scale, height * scale);
    }
  };

  // Draw cube preview
  const drawCubePreview = (ctx: CanvasRenderingContext2D, element: any, scale: number) => {
    const width = element.width * scale;
    const height = element.height * scale;
    const depth = element.depth * scale;

    // Draw front face
    ctx.beginPath();
    ctx.rect(-width / 2, -height / 2, width, height);
    ctx.stroke();
    ctx.fillStyle = "rgba(79, 131, 237, 0.2)";
    ctx.fill();

    // Suggest 3D with perspective lines to corners
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(-width / 2, -height / 2);
    ctx.lineTo(-width / 2 - depth / 4, -height / 2 - depth / 4);
    ctx.moveTo(width / 2, -height / 2);
    ctx.lineTo(width / 2 + depth / 4, -height / 2 - depth / 4);
    ctx.moveTo(width / 2, height / 2);
    ctx.lineTo(width / 2 + depth / 4, height / 2 - depth / 4);
    ctx.moveTo(-width / 2, height / 2);
    ctx.lineTo(-width / 2 - depth / 4, height / 2 - depth / 4);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw top face
    ctx.beginPath();
    ctx.moveTo(-width / 2 - depth / 4, -height / 2 - depth / 4);
    ctx.lineTo(width / 2 + depth / 4, -height / 2 - depth / 4);
    ctx.lineTo(width / 2, -height / 2);
    ctx.lineTo(-width / 2, -height / 2);
    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = "rgba(79, 131, 237, 0.3)";
    ctx.fill();
  };

  // Draw sphere preview
  const drawSpherePreview = (ctx: CanvasRenderingContext2D, element: any, scale: number) => {
    const radius = element.radius * scale;

    // Draw circle for sphere
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "rgba(79, 131, 237, 0.2)";
    ctx.fill();

    // Draw ellipse on top to suggest 3D
    ctx.beginPath();
    ctx.ellipse(0, -radius * 0.1, radius * 0.8, radius * 0.3, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "rgba(79, 131, 237, 0.3)";
    ctx.fill();
  };

  // Draw cylinder preview
  const drawCylinderPreview = (ctx: CanvasRenderingContext2D, element: any, scale: number) => {
    const radius = element.radius * scale;
    const height = element.height * scale;

    // Draw rectangle for side view
    ctx.beginPath();
    ctx.rect(-radius, -height / 2, radius * 2, height);
    ctx.stroke();
    ctx.fillStyle = "rgba(79, 131, 237, 0.2)";
    ctx.fill();

    // Draw top ellipse
    ctx.beginPath();
    ctx.ellipse(0, -height / 2, radius, radius * 0.3, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "rgba(79, 131, 237, 0.3)";
    ctx.fill();

    // Draw bottom ellipse if visible
    ctx.beginPath();
    ctx.ellipse(0, height / 2, radius, radius * 0.3, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "rgba(79, 131, 237, 0.25)";
    ctx.fill();
  };

  // Draw cone preview
  const drawConePreview = (ctx: CanvasRenderingContext2D, element: any, scale: number) => {
    const radius = element.radius * scale;
    const height = element.height * scale;

    // Draw triangle for side view
    ctx.beginPath();
    ctx.moveTo(-radius, height / 2);
    ctx.lineTo(radius, height / 2);
    ctx.lineTo(0, -height / 2);
    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = "rgba(79, 131, 237, 0.2)";
    ctx.fill();

    // Draw base ellipse
    ctx.beginPath();
    ctx.ellipse(0, height / 2, radius, radius * 0.3, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "rgba(79, 131, 237, 0.3)";
    ctx.fill();
  };

  // Draw rectangle preview (extrude 2D shape)
  const drawRectanglePreview = (ctx: CanvasRenderingContext2D, element: any, scale: number) => {
    const width = element.width * scale;
    const height = element.height * scale;
    const depth = 10 * scale; // Default extrusion depth

    // Draw main rectangle
    ctx.beginPath();
    ctx.rect(-width / 2, -height / 2, width, height);
    ctx.stroke();
    ctx.fillStyle = "rgba(79, 131, 237, 0.2)";
    ctx.fill();

    // Suggest 3D extrusion with perspective lines
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(-width / 2, -height / 2);
    ctx.lineTo(-width / 2, -height / 2 - depth / 2);
    ctx.moveTo(width / 2, -height / 2);
    ctx.lineTo(width / 2, -height / 2 - depth / 2);
    ctx.moveTo(width / 2, height / 2);
    ctx.lineTo(width / 2, height / 2 - depth / 2);
    ctx.moveTo(-width / 2, height / 2);
    ctx.lineTo(-width / 2, height / 2 - depth / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw top face
    ctx.beginPath();
    ctx.moveTo(-width / 2, -height / 2 - depth / 2);
    ctx.lineTo(width / 2, -height / 2 - depth / 2);
    ctx.lineTo(width / 2, -height / 2);
    ctx.lineTo(-width / 2, -height / 2);
    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = "rgba(79, 131, 237, 0.3)";
    ctx.fill();
  };

  // Draw circle preview (extrude 2D shape)
  const drawCirclePreview = (ctx: CanvasRenderingContext2D, element: any, scale: number) => {
    const radius = element.radius * scale;
    const depth = 10 * scale; // Default extrusion depth

    // Draw main circle
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "rgba(79, 131, 237, 0.2)";
    ctx.fill();

    // Draw top ellipse to suggest 3D
    ctx.beginPath();
    ctx.ellipse(0, -depth / 2, radius, radius * 0.3, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "rgba(79, 131, 237, 0.3)";
    ctx.fill();

    // Draw side lines
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(-radius, 0);
    ctx.lineTo(-radius, -depth / 2);
    ctx.moveTo(radius, 0);
    ctx.lineTo(radius, -depth / 2);
    ctx.stroke();
    ctx.setLineDash([]);
  };

  // Draw polygon preview
  const drawPolygonPreview = (ctx: CanvasRenderingContext2D, element: any, scale: number) => {
    const radius = element.radius * scale;
    const sides = element.sides || 6;
    const depth = 10 * scale; // Default extrusion depth

    // Draw main polygon
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const angle = i * ((2 * Math.PI) / sides);
      const x = radius * Math.cos(angle);
      const y = radius * Math.sin(angle);
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = "rgba(79, 131, 237, 0.2)";
    ctx.fill();

    // Draw top polygon to suggest 3D
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const angle = i * ((2 * Math.PI) / sides);
      const x = radius * 0.8 * Math.cos(angle);
      const y = radius * 0.8 * Math.sin(angle) - depth / 2;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = "rgba(79, 131, 237, 0.3)";
    ctx.fill();

    // Draw some side lines
    ctx.setLineDash([2, 2]);
    for (let i = 0; i < 3; i++) {
      const angle = i * ((2 * Math.PI) / 3);
      const x = radius * Math.cos(angle);
      const y = radius * Math.sin(angle);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x * 0.8, y - depth / 2);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  };

  // Draw visualization of print settings
  const drawSettingsPreview = (
    ctx: CanvasRenderingContext2D,
    element: any,
    scale: number,
    options: {
      infillDensity: number;
      shellCount: number;
      supportType: "none" | "minimal" | "full";
      infillPattern: "grid" | "lines" | "triangles" | "honeycomb";
      layerHeight: number;
    }
  ) => {
    const { width, height, depth } = extractElementDimensions(element);
    const scaledWidth = width * scale;
    const scaledHeight = height * scale;

    // Draw layer representation
    const layerThickness = Math.max(2, options.layerHeight * scale * 5); // Scale up for visibility
    const layerCount = Math.floor(scaledHeight / layerThickness);

    // Draw infill pattern on a single visible layer (middle layer)
    const middleY = 0;

    // Draw infill pattern in middle layer
    drawInfillPattern(
      ctx,
      -scaledWidth / 2,
      middleY - layerThickness / 2,
      scaledWidth,
      layerThickness,
      options.infillPattern,
      options.infillDensity
    );

    // Draw shells around the perimeter
    if (element.type === "rectangle" || element.type === "cube") {
      for (let i = 0; i < options.shellCount; i++) {
        const shellInset = i * 2; // Scale for visibility
        ctx.strokeStyle = "rgba(79, 131, 237, 0.8)";
        ctx.lineWidth = 1;
        ctx.strokeRect(
          -scaledWidth / 2 + shellInset,
          -scaledHeight / 2 + shellInset,
          scaledWidth - shellInset * 2,
          scaledHeight - shellInset * 2
        );
      }
    } else if (element.type === "circle" || element.type === "sphere" || element.type === "cylinder") {
      for (let i = 0; i < options.shellCount; i++) {
        const shellInset = i * 2; // Scale for visibility
        const effectiveRadius = element.radius * scale - shellInset;
        if (effectiveRadius <= 0) continue;

        ctx.strokeStyle = "rgba(79, 131, 237, 0.8)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, 0, effectiveRadius, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Draw support structures if selected
    if (options.supportType !== "none") {
      drawSupportStructures(ctx, element, scale, options.supportType);
    }
  };

  // Draw infill pattern
  const drawInfillPattern = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    pattern: "grid" | "lines" | "triangles" | "honeycomb",
    density: number
  ) => {
    const spacing = Math.max(5, 30 - density / 4); // Convert density to visual spacing

    ctx.strokeStyle = "rgba(255, 120, 0, 0.5)";
    ctx.lineWidth = 0.5;

    switch (pattern) {
      case "grid":
        // Horizontal lines
        for (let py = y; py < y + height; py += spacing) {
          ctx.beginPath();
          ctx.moveTo(x, py);
          ctx.lineTo(x + width, py);
          ctx.stroke();
        }
        // Vertical lines
        for (let px = x; px < x + width; px += spacing) {
          ctx.beginPath();
          ctx.moveTo(px, y);
          ctx.lineTo(px, y + height);
          ctx.stroke();
        }
        break;

      case "lines":
        // Just horizontal lines
        for (let py = y; py < y + height; py += spacing) {
          ctx.beginPath();
          ctx.moveTo(x, py);
          ctx.lineTo(x + width, py);
          ctx.stroke();
        }
        break;

      case "triangles":
        // Draw triangular pattern
        const triHeight = (spacing * Math.sqrt(3)) / 2;
        let rowOffset = 0;

        for (let py = y; py < y + height; py += triHeight) {
          rowOffset = rowOffset === 0 ? spacing / 2 : 0;

          for (let px = x + rowOffset; px < x + width; px += spacing) {
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(px - spacing / 2, py + triHeight);
            ctx.lineTo(px + spacing / 2, py + triHeight);
            ctx.closePath();
            ctx.stroke();
          }
        }
        break;

      case "honeycomb":
        // Draw honeycomb pattern
        const hexSize = spacing / 1.5;
        const hexWidth = hexSize * 2;
        const hexHeight = hexSize * Math.sqrt(3);

        for (let row = 0; row * hexHeight * 0.75 < height; row++) {
          const isOffsetRow = row % 2 === 1;
          const startX = isOffsetRow ? x + hexWidth / 2 : x;

          for (let col = 0; startX + col * hexWidth < x + width; col++) {
            const centerX = startX + col * hexWidth;
            const centerY = y + row * hexHeight * 0.75;

            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
              const angle = ((i * 60 - 30) * Math.PI) / 180;
              const hx = centerX + hexSize * Math.cos(angle);
              const hy = centerY + hexSize * Math.sin(angle);

              if (i === 0) {
                ctx.moveTo(hx, hy);
              } else {
                ctx.lineTo(hx, hy);
              }
            }
            ctx.closePath();
            ctx.stroke();
          }
        }
        break;
    }
  };

  // Draw support structures based on type
  const drawSupportStructures = (
    ctx: CanvasRenderingContext2D,
    element: any,
    scale: number,
    supportType: "none" | "minimal" | "full"
  ) => {
    if (supportType === "none") return;

    ctx.strokeStyle = "rgba(100, 200, 100, 0.6)";
    ctx.lineWidth = 1;

    const { width, height } = extractElementDimensions(element);
    const scaledWidth = width * scale;
    const scaledHeight = height * scale;

    // Determine support density based on type
    const supportSpacing = supportType === "minimal" ? 15 : 8;

    // Draw support lines from bottom to element
    const supportHeight = 40; // Visual height of supports

    // Get support positions based on element type
    let supportPoints: [number, number][] = [];

    switch (element.type) {
      case "cube":
      case "rectangle":
        // Supports at corners and center
        supportPoints = [
          [-scaledWidth / 2, scaledHeight / 2],
          [scaledWidth / 2, scaledHeight / 2],
          [-scaledWidth / 2, -scaledHeight / 2],
          [scaledWidth / 2, -scaledHeight / 2],
          [0, 0]
        ];
        break;

      case "sphere":
      case "circle":
        // Supports around the circumference
        const radius = element.radius * scale;
        for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
          supportPoints.push([radius * Math.cos(angle), radius * Math.sin(angle)]);
        }
        break;

      case "cylinder":
        // Supports around the cylinder base
        const cylRadius = element.radius * scale;
        const cylHeight = element.height * scale;
        for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
          supportPoints.push([cylRadius * Math.cos(angle), cylHeight / 2]);
        }
        break;

      case "cone":
        // Supports around the cone base
        const coneRadius = element.radius * scale;
        const coneHeight = element.height * scale;
        for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
          supportPoints.push([coneRadius * Math.cos(angle), coneHeight / 2]);
        }
        break;

      default:
        // Generic supports
        supportPoints = [
          [-scaledWidth / 4, scaledHeight / 4],
          [scaledWidth / 4, scaledHeight / 4],
          [-scaledWidth / 4, -scaledHeight / 4],
          [scaledWidth / 4, -scaledHeight / 4]
        ];
    }

    // Draw support lines
    for (const [x, y] of supportPoints) {
      // Don't draw supports above the object (where y is negative in canvas coords)
      if (y < 0) continue;

      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + supportHeight);
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw cross supports
      if (supportType === "full") {
        const crossSpacing = 6;
        for (let crossY = y + crossSpacing; crossY < y + supportHeight; crossY += crossSpacing) {
          ctx.beginPath();
          ctx.moveTo(x - 3, crossY);
          ctx.lineTo(x + 3, crossY);
          ctx.stroke();
        }
      }
    }
  };

  if (!element) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-100 rounded-md">
        <p className="text-gray-500 text-sm">Select an element to preview</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center p-2 bg-white rounded-md border border-gray-200">
      <h3 className="text-sm font-medium text-gray-700 mb-2">3D Print Preview</h3>
      <canvas ref={canvasRef} width={300} height={300} className="w-full h-full bg-white" />
      <div className="mt-2 text-xs text-gray-500 w-full text-center">{element && `Element: ${element.type}`}</div>
    </div>
  );
};

export default PrinterPreview;

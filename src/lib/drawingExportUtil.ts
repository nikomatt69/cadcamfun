// src/utils/drawingExportUtil.ts

import { saveAs } from "file-saver";
import {
  Point,
  DrawingEntity,
  Dimension,
  Annotation,
  DrawingViewport,
  DrawingSheet
} from "../types/TechnicalDrawingTypes";

// Helper to convert drawing data to DXF format
function generateDXF(
  entities: { [id: string]: DrawingEntity },
  dimensions: { [id: string]: Dimension },
  annotations: { [id: string]: Annotation },
  sheet: DrawingSheet
): string {
  // This is a simplified DXF format implementation
  // For a production-ready solution, using a library would be preferable

  let dxfContent = `0
SECTION
2
HEADER
9
$ACADVER
1
AC1027
9
$INSBASE
10
0.0
20
0.0
30
0.0
9
$EXTMIN
10
0.0
20
0.0
9
$EXTMAX
10
${sheet.width}
20
${sheet.height}
0
ENDSEC
0
SECTION
2
TABLES
0
TABLE
2
LTYPE
0
LTYPE
2
CONTINUOUS
70
64
3
Solid line
72
65
73
0
40
0.0
0
LTYPE
2
DASHED
70
64
3
Dashed line
72
65
73
2
40
10.0
49
8.0
74
0
49
-2.0
74
0
0
LTYPE
2
DOT
70
64
3
Dotted line
72
65
73
2
40
4.0
49
0.0
74
0
49
-4.0
74
0
0
LTYPE
2
DASHDOT
70
64
3
Dash dot line
72
65
73
4
40
20.0
49
12.0
74
0
49
-2.0
74
0
49
0.0
74
0
49
-6.0
74
0
0
ENDTAB
0
TABLE
2
LAYER
0
LAYER
2
0
70
64
62
7
6
CONTINUOUS
0
LAYER
2
DIMENSIONS
70
64
62
1
6
CONTINUOUS
0
LAYER
2
ANNOTATIONS
70
64
62
5
6
CONTINUOUS
0
ENDTAB
0
ENDSEC
0
SECTION
2
ENTITIES
`;

  // Add entities to DXF
  Object.values(entities).forEach(entity => {
    switch (entity.type) {
      case "line":
        dxfContent += `0
LINE
8
${entity.layer}
10
${entity.startPoint.x}
20
${entity.startPoint.y}
30
0
11
${entity.endPoint.x}
21
${entity.endPoint.y}
31
0
`;
        break;

      case "circle":
        dxfContent += `0
CIRCLE
8
${entity.layer}
10
${entity.center.x}
20
${entity.center.y}
30
0
40
${entity.radius}
`;
        break;

      case "arc":
        dxfContent += `0
ARC
8
${entity.layer}
10
${entity.center.x}
20
${entity.center.y}
30
0
40
${entity.radius}
50
${(entity.startAngle * 180) / Math.PI}
51
${(entity.endAngle * 180) / Math.PI}
`;
        break;

      case "rectangle":
        // Rectangles are drawn as polylines in DXF
        dxfContent += `0
POLYLINE
8
${entity.layer}
66
1
70
1
0
VERTEX
8
${entity.layer}
10
${entity.position.x}
20
${entity.position.y}
30
0
0
VERTEX
8
${entity.layer}
10
${entity.position.x + entity.width}
20
${entity.position.y}
30
0
0
VERTEX
8
${entity.layer}
10
${entity.position.x + entity.width}
20
${entity.position.y + entity.height}
30
0
0
VERTEX
8
${entity.layer}
10
${entity.position.x}
20
${entity.position.y + entity.height}
30
0
0
SEQEND
`;
        break;

      // Add more entity types as needed
    }
  });

  // Add dimensions to DXF
  Object.values(dimensions).forEach(dimension => {
    switch (dimension.type) {
      case "linear-dimension":
        dxfContent += `0
DIMENSION
8
DIMENSIONS
2
*D0
70
32
10
${dimension.startPoint.x}
20
${dimension.startPoint.y}
30
0
11
${(dimension.startPoint.x + dimension.endPoint.x) / 2}
21
${dimension.startPoint.y + dimension.offsetDistance}
31
0
13
${dimension.startPoint.x}
23
${dimension.startPoint.y}
33
0
14
${dimension.endPoint.x}
24
${dimension.endPoint.y}
34
0
50
0
`;
        break;

      // Add more dimension types as needed
    }
  });

  // Add annotations to DXF
  Object.values(annotations).forEach(annotation => {
    switch (annotation.type) {
      case "text-annotation":
        dxfContent += `0
TEXT
8
ANNOTATIONS
10
${annotation.position.x}
20
${annotation.position.y}
30
0
40
${annotation.style.fontSize || 3.5}
1
${annotation.text}
`;
        break;

      // Add more annotation types as needed
    }
  });

  // Close DXF file
  dxfContent += `0
ENDSEC
0
EOF`;

  return dxfContent;
}

// Helper to convert drawing data to SVG format
function generateSVG(
  entities: { [id: string]: DrawingEntity },
  dimensions: { [id: string]: Dimension },
  annotations: { [id: string]: Annotation },
  sheet: DrawingSheet,
  viewports: { [id: string]: DrawingViewport }
): string {
  let svgContent = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg width="${sheet.width}${sheet.units}" height="${sheet.height}${sheet.units}" 
  viewBox="0 0 ${sheet.width} ${sheet.height}" 
  xmlns="http://www.w3.org/2000/svg" version="1.1">
  <desc>Technical Drawing</desc>
  
  <!-- Sheet border -->
  <rect x="0" y="0" width="${sheet.width}" height="${sheet.height}" 
    fill="white" stroke="black" stroke-width="0.5"/>
`;

  // Add title block if exists
  if (sheet.titleBlock) {
    const tb = sheet.titleBlock;
    svgContent += `  
  <!-- Title block -->
  <rect x="${tb.position.x}" y="${tb.position.y}" width="${tb.width}" height="${tb.height}" 
    fill="none" stroke="black" stroke-width="0.5"/>
  
  <!-- Title block content -->
  <text x="${tb.position.x + 5}" y="${tb.position.y + 10}" 
    font-family="Arial" font-size="7" font-weight="bold">${tb.fields.title}</text>
  <text x="${tb.position.x + 5}" y="${tb.position.y + 20}" 
    font-family="Arial" font-size="5">Drawing No: ${tb.fields.drawingNumber}</text>
  <text x="${tb.position.x + 5}" y="${tb.position.y + 28}" 
    font-family="Arial" font-size="5">Rev: ${tb.fields.revision} | Date: ${tb.fields.date} | Scale: ${tb.fields.scale}</text>
`;
  }

  // Add viewports
  Object.values(viewports).forEach(viewport => {
    svgContent += `  
  <!-- Viewport: ${viewport.name} -->
  <g transform="translate(${viewport.position.x},${viewport.position.y})">
    <!-- Viewport border -->
    <rect x="0" y="0" width="${viewport.width}" height="${viewport.height}" 
      fill="none" stroke="#888888" stroke-width="0.3" stroke-dasharray="3,2"/>
    
    <!-- Viewport title -->
    <text x="${viewport.width / 2}" y="-5" 
      font-family="Arial" font-size="4" text-anchor="middle">${viewport.name}</text>
`;

    // Add entities for this viewport
    viewport.entities.forEach(entityId => {
      if (entities[entityId]) {
        const entity = entities[entityId];
        switch (entity.type) {
          case "line":
            svgContent += `    <line x1="${entity.startPoint.x}" y1="${entity.startPoint.y}" 
      x2="${entity.endPoint.x}" y2="${entity.endPoint.y}" 
      stroke="${entity.style.strokeColor}" stroke-width="${entity.style.strokeWidth}"`;

            // Add dash pattern if not solid
            if (entity.style.strokeStyle !== "solid") {
              let dashPattern = "";
              switch (entity.style.strokeStyle) {
                case "dashed":
                  dashPattern = "5,2";
                  break;
                case "dotted":
                  dashPattern = "1,2";
                  break;
                case "dash-dot":
                  dashPattern = "5,2,1,2";
                  break;
                case "center":
                  dashPattern = "10,2,2,2";
                  break;
                case "phantom":
                  dashPattern = "10,2,2,2,2,2";
                  break;
                case "hidden":
                  dashPattern = "5,5";
                  break;
              }
              svgContent += ` stroke-dasharray="${dashPattern}"`;
            }

            svgContent += `/>\n`;
            break;

          case "circle":
            svgContent += `    <circle cx="${entity.center.x}" cy="${entity.center.y}" r="${entity.radius}" 
      fill="${entity.style.fillColor || "none"}" 
      stroke="${entity.style.strokeColor}" stroke-width="${entity.style.strokeWidth}"`;

            // Add dash pattern if not solid
            if (entity.style.strokeStyle !== "solid") {
              let dashPattern = "";
              switch (entity.style.strokeStyle) {
                case "dashed":
                  dashPattern = "5,2";
                  break;
                // Add other patterns...
              }
              svgContent += ` stroke-dasharray="${dashPattern}"`;
            }

            svgContent += `/>\n`;
            break;

          case "arc":
            // Create an SVG arc path
            const startAngleRad = entity.startAngle;
            const endAngleRad = entity.endAngle;

            // Calculate start and end points
            const startX = entity.center.x + entity.radius * Math.cos(startAngleRad);
            const startY = entity.center.y + entity.radius * Math.sin(startAngleRad);
            const endX = entity.center.x + entity.radius * Math.cos(endAngleRad);
            const endY = entity.center.y + entity.radius * Math.sin(endAngleRad);

            // Determine if the arc is larger than 180 degrees
            const largeArcFlag = Math.abs(endAngleRad - startAngleRad) > Math.PI ? 1 : 0;

            // Determine if the arc should be drawn counter-clockwise
            const sweepFlag = entity.counterclockwise ? 0 : 1;

            svgContent += `    <path d="M ${startX} ${startY} A ${entity.radius} ${entity.radius} 0 ${largeArcFlag} ${sweepFlag} ${endX} ${endY}" 
      fill="none" 
      stroke="${entity.style.strokeColor}" stroke-width="${entity.style.strokeWidth}"`;

            // Add dash pattern if not solid
            if (entity.style.strokeStyle !== "solid") {
              let dashPattern = "";
              switch (entity.style.strokeStyle) {
                case "dashed":
                  dashPattern = "5,2";
                  break;
                // Add other patterns...
              }
              svgContent += ` stroke-dasharray="${dashPattern}"`;
            }

            svgContent += `/>\n`;
            break;

          case "rectangle":
            svgContent += `    <rect x="${entity.position.x}" y="${entity.position.y}" 
      width="${entity.width}" height="${entity.height}" 
      fill="${entity.style.fillColor || "none"}" 
      stroke="${entity.style.strokeColor}" stroke-width="${entity.style.strokeWidth}"`;

            // Add rotation if specified
            if (entity.rotation) {
              const centerX = entity.position.x + entity.width / 2;
              const centerY = entity.position.y + entity.height / 2;
              svgContent += ` transform="rotate(${entity.rotation} ${centerX} ${centerY})"`;
            }

            // Add dash pattern if not solid
            if (entity.style.strokeStyle !== "solid") {
              let dashPattern = "";
              switch (entity.style.strokeStyle) {
                case "dashed":
                  dashPattern = "5,2";
                  break;
                // Add other patterns...
              }
              svgContent += ` stroke-dasharray="${dashPattern}"`;
            }

            svgContent += `/>\n`;
            break;

          case "polyline":
            if (entity.points.length > 0) {
              svgContent += `    <polyline points="`;
              entity.points.forEach(point => {
                svgContent += `${point.x},${point.y} `;
              });
              svgContent += `" fill="${entity.closed && entity.style.fillColor ? entity.style.fillColor : "none"}" 
      stroke="${entity.style.strokeColor}" stroke-width="${entity.style.strokeWidth}"`;

              // Add dash pattern if not solid
              if (entity.style.strokeStyle !== "solid") {
                let dashPattern = "";
                switch (entity.style.strokeStyle) {
                  case "dashed":
                    dashPattern = "5,2";
                    break;
                  // Add other patterns...
                }
                svgContent += ` stroke-dasharray="${dashPattern}"`;
              }

              svgContent += `/>\n`;
            }
            break;

          case "ellipse":
            svgContent += `    <ellipse cx="${entity.center.x}" cy="${entity.center.y}" 
      rx="${entity.radiusX}" ry="${entity.radiusY}" 
      fill="${entity.style.fillColor || "none"}" 
      stroke="${entity.style.strokeColor}" stroke-width="${entity.style.strokeWidth}"`;

            // Add rotation if specified
            if (entity.rotation) {
              svgContent += ` transform="rotate(${entity.rotation} ${entity.center.x} ${entity.center.y})"`;
            }

            // Add dash pattern if not solid
            if (entity.style.strokeStyle !== "solid") {
              let dashPattern = "";
              switch (entity.style.strokeStyle) {
                case "dashed":
                  dashPattern = "5,2";
                  break;
                // Add other patterns...
              }
              svgContent += ` stroke-dasharray="${dashPattern}"`;
            }

            svgContent += `/>\n`;
            break;

          // Add more entity types as needed
        }
      } else if (dimensions[entityId]) {
        const dimension = dimensions[entityId];
        switch (dimension.type) {
          case "linear-dimension":
            // Extension lines
            svgContent += `    <line x1="${dimension.startPoint.x}" y1="${dimension.startPoint.y}" 
      x2="${dimension.startPoint.x}" y2="${dimension.startPoint.y + dimension.offsetDistance}" 
      stroke="${dimension.style.strokeColor}" stroke-width="${dimension.style.strokeWidth}"/>\n`;

            svgContent += `    <line x1="${dimension.endPoint.x}" y1="${dimension.endPoint.y}" 
      x2="${dimension.endPoint.x}" y2="${dimension.endPoint.y + dimension.offsetDistance}" 
      stroke="${dimension.style.strokeColor}" stroke-width="${dimension.style.strokeWidth}"/>\n`;

            // Dimension line
            svgContent += `    <line x1="${dimension.startPoint.x}" y1="${dimension.startPoint.y + dimension.offsetDistance}" 
      x2="${dimension.endPoint.x}" y2="${dimension.endPoint.y + dimension.offsetDistance}" 
      stroke="${dimension.style.strokeColor}" stroke-width="${dimension.style.strokeWidth}"/>\n`;

            // Arrows - using SVG path for arrowheads
            const arrowSize = 3;

            svgContent += `    <path d="M ${dimension.startPoint.x} ${dimension.startPoint.y + dimension.offsetDistance} 
      L ${dimension.startPoint.x + arrowSize} ${dimension.startPoint.y + dimension.offsetDistance - arrowSize / 2} 
      L ${dimension.startPoint.x + arrowSize} ${dimension.startPoint.y + dimension.offsetDistance + arrowSize / 2} Z" 
      fill="${dimension.style.strokeColor}" stroke="none"/>\n`;

            svgContent += `    <path d="M ${dimension.endPoint.x} ${dimension.endPoint.y + dimension.offsetDistance} 
      L ${dimension.endPoint.x - arrowSize} ${dimension.endPoint.y + dimension.offsetDistance - arrowSize / 2} 
      L ${dimension.endPoint.x - arrowSize} ${dimension.endPoint.y + dimension.offsetDistance + arrowSize / 2} Z" 
      fill="${dimension.style.strokeColor}" stroke="none"/>\n`;

            // Dimension text
            const textX = (dimension.startPoint.x + dimension.endPoint.x) / 2;
            const textY = dimension.startPoint.y + dimension.offsetDistance - 2;

            svgContent += `    <text x="${textX}" y="${textY}" 
      font-family="${dimension.style.fontFamily || "Arial"}" 
      font-size="${dimension.style.fontSize || 3.5}" 
      text-anchor="middle" 
      fill="${dimension.style.strokeColor}">${dimension.text || ""}</text>\n`;
            break;

          // Add more dimension types as needed
        }
      } else if (annotations[entityId]) {
        const annotation = annotations[entityId];
        switch (annotation.type) {
          case "text-annotation":
            svgContent += `    <text x="${annotation.position.x}" y="${annotation.position.y}" 
      font-family="${annotation.style.fontFamily || "Arial"}" 
      font-size="${annotation.style.fontSize || 3.5}" 
      font-weight="${annotation.style.fontWeight || "normal"}"
      text-anchor="${annotation.style.textAlign || "start"}"
      fill="${annotation.style.strokeColor}"`;

            // Add rotation if specified
            if (annotation.rotation) {
              svgContent += ` transform="rotate(${annotation.rotation} ${annotation.position.x} ${annotation.position.y})"`;
            }

            svgContent += `>${annotation.text}</text>\n`;
            break;

          case "leader-annotation":
            // Leader line
            if (annotation.points.length > 0) {
              svgContent += `    <polyline points="${annotation.startPoint.x},${annotation.startPoint.y} `;
              annotation.points.forEach(point => {
                svgContent += `${point.x},${point.y} `;
              });
              svgContent += `" fill="none" stroke="${annotation.style.strokeColor}" stroke-width="${annotation.style.strokeWidth}"/>\n`;
            }

            // Text
            const textPosition = annotation.textPosition || annotation.points[annotation.points.length - 1];
            svgContent += `    <text x="${textPosition.x}" y="${textPosition.y}" 
      font-family="${annotation.style.fontFamily || "Arial"}" 
      font-size="${annotation.style.fontSize || 3.5}" 
      fill="${annotation.style.strokeColor}">${annotation.text}</text>\n`;
            break;

          // Add more annotation types as needed
        }
      }
    });

    // Close viewport group
    svgContent += `  </g>\n`;
  });

  // Close SVG
  svgContent += `</svg>`;

  return svgContent;
}

// Export functions
export function exportToDXF(
  entities: { [id: string]: DrawingEntity },
  dimensions: { [id: string]: Dimension },
  annotations: { [id: string]: Annotation },
  sheet: DrawingSheet
): void {
  const dxfContent = generateDXF(entities, dimensions, annotations, sheet);
  const blob = new Blob([dxfContent], { type: "application/dxf" });
  saveAs(blob, "technical_drawing.dxf");
}

export function exportToSVG(
  entities: { [id: string]: DrawingEntity },
  dimensions: { [id: string]: Dimension },
  annotations: { [id: string]: Annotation },
  sheet: DrawingSheet,
  viewports: { [id: string]: DrawingViewport }
): void {
  const svgContent = generateSVG(entities, dimensions, annotations, sheet, viewports);
  const blob = new Blob([svgContent], { type: "image/svg+xml" });
  saveAs(blob, "technical_drawing.svg");
}

export function exportToPNG(canvasElement: HTMLCanvasElement, filename: string, dpi = 300): void {
  if (!canvasElement) {
    console.error("Canvas element is required for PNG export");
    return;
  }

  try {
    // Get the canvas data
    const imgData = canvasElement.toDataURL("image/png");

    // Create download link
    const a = document.createElement("a");
    a.href = imgData;
    a.download = filename || "technical_drawing.png";
    a.click();
  } catch (error) {
    console.error("Error exporting to PNG:", error);
  }
}

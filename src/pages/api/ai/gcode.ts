// Unified G-Code API
// Consolidates: analyze-gcode.ts + gcode-completion.ts + gcode-*.ts
// Actions: analyze, optimize, complete, validate, generate
import type { NextApiRequest, NextApiResponse } from "next";
import { requireAuth } from "src/lib/api/auth";
import { unifiedAIService } from "@/src/lib/ai/unifiedAIService";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({
      success: false,
      error: "Method POST required"
    });
  }

  try {
    const {
      action = "analyze",
      gcode,
      partialCode,
      machineType = "generic",
      material = "aluminum",
      model = "claude-sonnet-4-20250514",
      options = {}
    } = req.body;

    let response;

    switch (action) {
      case "analyze":
        // G-Code analysis
        if (!gcode) {
          return res.status(400).json({
            success: false,
            error: "G-code is required for analysis"
          });
        }

        response = await unifiedAIService.optimizeGCode(gcode, machineType, material);
        break;

      case "optimize":
        // G-Code optimization
        if (!gcode) {
          return res.status(400).json({
            success: false,
            error: "G-code is required for optimization"
          });
        }

        response = await unifiedAIService.optimizeGCode(gcode, machineType, material);
        // Add optimization-specific processing here
        break;

      case "complete":
        // G-Code completion (autocomplete)
        if (!partialCode) {
          return res.status(400).json({
            success: false,
            error: "Partial code is required for completion"
          });
        }

        // Use completion service
        response = await unifiedAIService.completeGCode(partialCode, {
          machineType,
          material,
          maxSuggestions: options.maxSuggestions || 5,
          context: options.context || ""
        });
        break;

      case "validate":
        // G-Code validation (simplified to use optimization analysis)
        if (!gcode) {
          return res.status(400).json({
            success: false,
            error: "G-code is required for validation"
          });
        }

        response = await unifiedAIService.optimizeGCode(gcode, machineType, material);
        break;

      case "generate":
        // Generate G-Code from description (simplified approach)
        const { description, toolpathType } = req.body;
        if (!description) {
          return res.status(400).json({
            success: false,
            error: "Description is required for generation"
          });
        }

        // Use existing optimization service as base for generation
        const generationPrompt = `Generate G-code for: ${description}\nMachine: ${machineType}\nMaterial: ${material}`;
        response = await unifiedAIService.optimizeGCode("", machineType, generationPrompt);
        break;

      default:
        return res.status(400).json({
          success: false,
          error: `Unknown action: ${action}. Supported actions: analyze, optimize, complete, validate, generate`
        });
    }

    return res.status(200).json({
      success: true,
      action,
      data: response,
      processedAt: new Date().toISOString()
    });
  } catch (error: any) {
    console.error(`Error in G-Code ${req.body?.action || "operation"}:`, error);

    return res.status(500).json({
      success: false,
      error: error.message || "Error processing G-Code request",
      action: req.body?.action || "unknown",
      processedAt: new Date().toISOString(),
      ...(process.env.NODE_ENV === "development" && {
        stack: error.stack
      })
    });
  }
}

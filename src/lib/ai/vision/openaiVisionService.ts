// src/lib/ai/vision/openaiVisionService.ts - Servizio Vision API
import {
  ImageData,
  VisionAnalysisResult,
  CADVisionResult,
  ImageAnalysisRequest,
  VisionAPIResponse,
  VisionAnalysisType,
  VisionServiceConfig,
} from "@/src/types/visionTypes";
import type { Element } from "@/src/store/elementsStore";

export class OpenAIVisionService {
  private apiEndpoint = "/api/ai/openai-vision-proxy";
  private defaultConfig: VisionServiceConfig = {
    model: "gpt-4.1-mini",
    maxTokens: 4000,
    temperature: 0.3,
    timeout: 90000, // 90 seconds to handle complex vision processing
    retryAttempts: 3,
  };

  /**
   * Analizza una singola immagine con prompt personalizzato
   */
  async analyzeImage(
    imageUrl: string,
    prompt: string = "what's in this image?",
    cadContext?: any
  ): Promise<VisionAnalysisResult> {
    console.log(
      `🖼️ [OpenAIVisionService] Analyzing single image with prompt: "${prompt.substring(0, 50)}..."`
    );

    try {
      const response = await this.callVisionAPI({
        prompt,
        imageUrl,
        cadContext,
      });

      if (!response.success || !response.result) {
        throw new Error(response.error || "Vision API call failed");
      }

      return this.parseVisionResponse(response.result, "general");
    } catch (error) {
      console.error(
        "❌ [OpenAIVisionService] Single image analysis failed:",
        error
      );
      return this.createFallbackResult(
        `Image analysis failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        0.0
      );
    }
  }

  /**
   * Analizza multiple immagini
   */
  async analyzeMultipleImages(
    images: ImageData[],
    prompt: string,
    cadContext?: any
  ): Promise<VisionAnalysisResult[]> {
    console.log(`🖼️ [OpenAIVisionService] Analyzing ${images.length} images`);

    const results: VisionAnalysisResult[] = [];

    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      try {
        console.log(
          `🔍 [OpenAIVisionService] Processing image ${i + 1}/${images.length}: ${image.name}`
        );

        const result = await this.analyzeImage(
          image.url || image.content || "",
          `${prompt} (Image ${i + 1} of ${images.length}: ${image.name})`,
          cadContext
        );

        results.push(result);
      } catch (error) {
        console.error(
          `❌ [OpenAIVisionService] Failed to analyze image ${image.name}:`,
          error
        );
        results.push(
          this.createFallbackResult(
            `Failed to analyze ${image.name}: ${error instanceof Error ? error.message : "Unknown error"}`,
            0.0
          )
        );
      }
    }

    return results;
  }

  /**
   * Analizza immagine specificamente per contesto CAD
   */
  async analyzeImageForCAD(
    imageUrl: string,
    cadElements: Element[],
    analysisType: VisionAnalysisType
  ): Promise<CADVisionResult> {
    console.log(
      `🔧 [OpenAIVisionService] CAD-specific analysis for type: ${analysisType}`
    );

    const cadPrompt = this.buildCADSpecificPrompt(analysisType, cadElements);

    try {
      const response = await this.callVisionAPI({
        prompt: cadPrompt,
        imageUrl,
        cadContext: {
          elements: cadElements,
          analysisType,
        },
      });

      if (!response.success || !response.result) {
        throw new Error(response.error || "CAD Vision analysis failed");
      }

      const baseResult = this.parseVisionResponse(
        response.result,
        analysisType
      );

      // Estendi con analisi CAD-specifica
      const cadResult: CADVisionResult = {
        ...baseResult,
        cadSpecificAnalysis: {
          detectedShapes: this.extractDetectedShapes(response.result),
          suggestedOperations: this.extractSuggestedOperations(response.result),
          materialRecommendations: this.extractMaterialRecommendations(
            response.result
          ),
          manufacturabilityScore: this.extractManufacturabilityScore(
            response.result
          ),
        },
      };

      console.log(
        `✅ [OpenAIVisionService] CAD analysis completed with confidence: ${cadResult.confidence}`
      );
      return cadResult;
    } catch (error) {
      console.error(
        "❌ [OpenAIVisionService] CAD image analysis failed:",
        error
      );

      // Fallback CAD result
      const fallbackResult = this.createFallbackResult(
        `CAD image analysis failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        0.0
      );

      return {
        ...fallbackResult,
        cadSpecificAnalysis: {
          detectedShapes: [],
          suggestedOperations: [],
          materialRecommendations: [],
          manufacturabilityScore: 0,
        },
      } as CADVisionResult;
    }
  }

  /**
   * Processa richiesta completa di analisi immagini
   */
  async processImageAnalysisRequest(
    request: ImageAnalysisRequest
  ): Promise<VisionAnalysisResult[]> {
    console.log(
      `📋 [OpenAIVisionService] Processing complete image analysis request`
    );
    console.log(
      `📊 Images: ${request.images.length}, Type: ${request.analysisType}`
    );

    if (request.images.length === 0) {
      console.warn("⚠️ [OpenAIVisionService] No images provided in request");
      return [
        this.createFallbackResult("No images provided for analysis", 0.0),
      ];
    }

    try {
      if (request.images.length === 1) {
        // Single image - use CAD-specific analysis
        const cadResult = await this.analyzeImageForCAD(
          request.images[0].url || request.images[0].content || "",
          request.cadContext?.elements || [],
          request.analysisType
        );
        return [cadResult];
      } else {
        // Multiple images - use batch analysis
        return await this.analyzeMultipleImages(
          request.images,
          request.prompt,
          request.cadContext
        );
      }
    } catch (error) {
      console.error(
        "❌ [OpenAIVisionService] Complete analysis request failed:",
        error
      );
      return [
        this.createFallbackResult(
          `Analysis request failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          0.0
        ),
      ];
    }
  }

  /**
   * Chiama l'API Vision tramite proxy
   */
  private async callVisionAPI({
    prompt,
    imageUrl,
    cadContext,
  }: {
    prompt: string;
    imageUrl: string;
    cadContext?: any;
  }): Promise<VisionAPIResponse> {
    const startTime = Date.now();

    try {
      console.log(
        `🌐 [OpenAIVisionService] Calling Vision API for image analysis`
      );

      const response = await fetch(this.apiEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt,
          imageUrl,
          cadContext,
          model: this.defaultConfig.model,
          maxTokens: this.defaultConfig.maxTokens,
          temperature: this.defaultConfig.temperature,
        }),
        signal: AbortSignal.timeout(this.defaultConfig.timeout),
      });

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ error: "Unknown API error" }));
        throw new Error(
          errorData.error ||
            `API returned ${response.status}: ${response.statusText}`
        );
      }

      const data = await response.json();
      const processingTime = Date.now() - startTime;

      console.log(
        `✅ [OpenAIVisionService] Vision API call successful (${processingTime}ms)`
      );

      return {
        success: true,
        result: data.result,
        metadata: {
          model: this.defaultConfig.model,
          processingTime,
          confidence: data.confidence,
        },
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error(
        `❌ [OpenAIVisionService] Vision API call failed (${processingTime}ms):`,
        error
      );

      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown API error",
        metadata: {
          model: this.defaultConfig.model,
          processingTime,
        },
      };
    }
  }

  /**
   * Costruisce prompt specifico per analisi CAD
   */
  private buildCADSpecificPrompt(
    analysisType: VisionAnalysisType,
    cadElements: Element[]
  ): string {
    let basePrompt = "Analyze this image from a CAD/engineering perspective. ";

    switch (analysisType) {
      case "design":
        basePrompt +=
          "Focus on design elements, geometry, proportions, and aesthetic considerations. Identify shapes, patterns, and design principles. Suggest how this could be modeled in CAD software.";
        break;

      case "manufacturing":
        basePrompt +=
          "Focus on manufacturing aspects: material properties, production methods, tolerances, surface finishes, and assembly considerations. Identify potential manufacturing challenges and suggest optimal production approaches.";
        break;

      case "measurement":
        basePrompt +=
          "Focus on extracting dimensions, measurements, and geometric properties. Identify key dimensions, angles, radii, and spatial relationships. Provide specific measurements where possible.";
        break;

      case "general":
      default:
        basePrompt +=
          "Provide a comprehensive analysis covering design, manufacturing, and measurement aspects. Identify key features and suggest CAD modeling approaches.";
        break;
    }

    if (cadElements.length > 0) {
      basePrompt += `\n\nCurrent CAD project contains ${cadElements.length} elements. Consider how this image relates to or could enhance the existing design.`;
    }

    basePrompt +=
      "\n\nProvide specific, actionable insights for CAD modeling and manufacturing.";

    return basePrompt;
  }

  /**
   * Parsa la risposta della Vision API
   */
  private parseVisionResponse(
    responseText: string,
    analysisType: VisionAnalysisType
  ): VisionAnalysisResult {
    // Estrae informazioni strutturate dalla risposta testuale
    const confidence = this.extractConfidence(responseText);

    return {
      analysis: responseText,
      confidence,
      extractedData: {
        dimensions: this.extractDimensions(responseText),
        materials: this.extractMaterials(responseText),
        components: this.extractComponents(responseText),
        measurements: this.extractMeasurements(responseText),
      },
      cadRecommendations: this.extractCADRecommendations(responseText),
      suggestions: this.extractSuggestions(responseText),
      manufacturingInsights:
        analysisType === "manufacturing"
          ? this.extractManufacturingInsights(responseText)
          : undefined,
      designOptimizations:
        analysisType === "design"
          ? this.extractDesignOptimizations(responseText)
          : undefined,
    };
  }

  /**
   * Crea risultato di fallback in caso di errore
   */
  private createFallbackResult(
    errorMessage: string,
    confidence: number
  ): VisionAnalysisResult {
    return {
      analysis: `⚠️ Vision analysis unavailable: ${errorMessage}\n\nPlease try again or use manual analysis approaches.`,
      confidence,
      extractedData: {
        dimensions: [],
        materials: [],
        components: [],
        measurements: [],
      },
      suggestions: [
        "Check image format and quality",
        "Verify internet connection",
        "Try with a different image",
        "Use manual CAD modeling tools",
      ],
    };
  }

  // Helper methods per estrarre informazioni specifiche dalla risposta
  private extractConfidence(text: string): number {
    const confidenceMatch = text.match(/confidence[:\s]*([\d.]+)/i);
    return confidenceMatch
      ? Math.min(parseFloat(confidenceMatch[1]), 1.0)
      : 0.7;
  }

  private extractDimensions(text: string): any[] {
    // Estrae dimensioni dal testo (implementazione semplificata)
    const dimensionMatches =
      text.match(/(\d+\.?\d*)\s*(mm|cm|m|inch|in)\b/gi) || [];
    return dimensionMatches.slice(0, 10).map((match, index) => ({
      type: "length",
      value: parseFloat(match),
      unit: match.replace(/[\d.]/g, "").trim(),
      confidence: 0.6,
      id: `dim_${index}`,
    }));
  }

  private extractMaterials(text: string): string[] {
    const materialKeywords = [
      "steel",
      "aluminum",
      "plastic",
      "wood",
      "copper",
      "brass",
      "titanium",
      "carbon fiber",
    ];
    const foundMaterials = materialKeywords.filter((material) =>
      text.toLowerCase().includes(material)
    );
    return foundMaterials;
  }

  private extractComponents(text: string): any[] {
    const componentKeywords = [
      "gear",
      "bearing",
      "shaft",
      "bracket",
      "housing",
      "connector",
      "fastener",
    ];
    const foundComponents = componentKeywords
      .filter((component) => text.toLowerCase().includes(component))
      .map((component) => ({
        name: component,
        type: "mechanical",
        confidence: 0.7,
      }));
    return foundComponents;
  }

  private extractMeasurements(text: string): any[] {
    // Semplificata - estrae misure dal testo
    const measurementMatches =
      text.match(/(\d+\.?\d*)\s*x\s*(\d+\.?\d*)/gi) || [];
    return measurementMatches.map((match, index) => ({
      type: "dimension",
      value: match,
      unit: "mm",
      accuracy: 0.6,
      id: `measure_${index}`,
    }));
  }

  private extractCADRecommendations(text: string): string {
    // Estrae raccomandazioni specifiche per CAD
    const lines = text.split("\n");
    const recommendations = lines.filter(
      (line) =>
        line.toLowerCase().includes("recommend") ||
        line.toLowerCase().includes("suggest") ||
        line.toLowerCase().includes("model")
    );
    return (
      recommendations.join("\n") || "No specific CAD recommendations found."
    );
  }

  private extractSuggestions(text: string): string[] {
    // Estrae suggerimenti generali
    const suggestions = [];
    if (text.toLowerCase().includes("improve"))
      suggestions.push("Consider design improvements");
    if (text.toLowerCase().includes("optimize"))
      suggestions.push("Optimize for manufacturing");
    if (text.toLowerCase().includes("measure"))
      suggestions.push("Add precise measurements");
    return suggestions.length > 0
      ? suggestions
      : ["Review image for CAD modeling opportunities"];
  }

  private extractManufacturingInsights(text: string): string {
    const lines = text.split("\n");
    const manufacturingLines = lines.filter(
      (line) =>
        line.toLowerCase().includes("manufactur") ||
        line.toLowerCase().includes("production") ||
        line.toLowerCase().includes("machining")
    );
    return (
      manufacturingLines.join("\n") ||
      "No specific manufacturing insights found."
    );
  }

  private extractDesignOptimizations(text: string): string[] {
    const optimizations = [];
    if (text.toLowerCase().includes("reduce"))
      optimizations.push("Material reduction opportunities");
    if (text.toLowerCase().includes("strengthen"))
      optimizations.push("Structural strengthening options");
    if (text.toLowerCase().includes("simplify"))
      optimizations.push("Design simplification potential");
    return optimizations;
  }

  // Metodi specifici per CADVisionResult
  private extractDetectedShapes(text: string): any[] {
    const shapeKeywords = [
      "cube",
      "sphere",
      "cylinder",
      "cone",
      "rectangle",
      "circle",
    ];
    return shapeKeywords
      .filter((shape) => text.toLowerCase().includes(shape))
      .map((shape) => ({
        type: shape,
        confidence: 0.7,
        properties: {},
      }));
  }

  private extractSuggestedOperations(text: string): any[] {
    const operations = [];
    if (text.toLowerCase().includes("drill"))
      operations.push({
        operation: "drilling",
        description: "Drilling operation suggested",
        priority: "medium" as const,
      });
    if (text.toLowerCase().includes("cut"))
      operations.push({
        operation: "cutting",
        description: "Cutting operation suggested",
        priority: "high" as const,
      });
    return operations;
  }

  private extractMaterialRecommendations(text: string): any[] {
    const materials = this.extractMaterials(text);
    return materials.map((material) => ({
      material,
      reasoning: `Detected in image analysis`,
      confidence: 0.7,
    }));
  }

  private extractManufacturabilityScore(text: string): number {
    // Punteggio semplificato basato su parole chiave
    let score = 50; // Base score
    if (text.toLowerCase().includes("easy")) score += 20;
    if (text.toLowerCase().includes("difficult")) score -= 20;
    if (text.toLowerCase().includes("complex")) score -= 15;
    if (text.toLowerCase().includes("simple")) score += 15;
    return Math.max(0, Math.min(100, score));
  }
}

// Esporta istanza singleton
export const openAIVisionService = new OpenAIVisionService();

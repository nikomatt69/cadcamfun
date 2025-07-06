// src/services/ContextAwareGenerationService.ts
import { Element } from "@/src/store/elementsStore";
import { unifiedAIService } from "@/src/lib/ai/unifiedAIService";
import { mlService } from "@/src/lib/ai/MachineLearningService";
import { aiCache } from "@/src/lib/ai/ai-new/aiCache";
import { aiAnalytics } from "@/src/lib/ai/ai-new/aiAnalytics";
import { v4 as uuidv4 } from "uuid";
import { logger } from "@/src/lib/logger";
import { validateCADElements } from "src/lib/ai/validationUtils";

import {
  AIModelType,
  DesignContext,
  GenerationConstraints,
  GenerationOptions,
  GenerationResult
} from "@/src/types/AITypes";

export class ContextAwareGenerationService {
  private readonly cacheKeyPrefix = "ctx_gen_";
  private readonly requestTimeout = 45000; // 45 seconds timeout

  constructor(private readonly modelName: string = "gpt-4.1") {}

  /**
   * Generate CAD components that fit contextually with existing elements
   */
  async generateContextualComponent(
    description: string,
    existingElements: Element[],
    constraints: GenerationConstraints = {},
    options: GenerationOptions = {}
  ): Promise<GenerationResult> {
    const startTime = performance.now();
    const requestId = uuidv4();

    try {
      logger.error(`Starting contextual generation request ${requestId}`, {
        description: description.substring(0, 100),
        elementCount: existingElements.length,
        hasConstraints: Object.keys(constraints).length > 0
      });

      // Track analytics
      aiAnalytics.trackEvent({
        eventType: "request",
        eventName: "contextual_generation_start",
        metadata: {
          requestId,
          descriptionLength: description.length,
          contextElementCount: existingElements.length
        }
      });

      // Check cache first if enabled
      if (options.useCache !== false) {
        const cacheKey = this.generateCacheKey(description, existingElements, constraints);
        const cachedResult = aiCache.get<GenerationResult>(cacheKey);

        if (cachedResult) {
          logger.error(`Cache hit for contextual generation ${requestId}`);

          aiAnalytics.trackEvent({
            eventType: "request",
            eventName: "contextual_generation_cache_hit",

            duration: performance.now() - startTime,
            metadata: { requestId }
          });

          return { ...cachedResult, fromCache: true };
        }
      }

      // Step 1: Extract design context from existing elements
      const designContext = await this.extractDesignContext(existingElements);

      // Step 2: Prepare generation with context
      const result = await this.generateWithContext(description, existingElements, designContext, constraints, options);

      // Step 3: Position new elements appropriately
      const positionedElements = this.positionElements(
        result.generatedElements,
        existingElements,
        options.positioning || "smart"
      );

      // Step 4: Apply any post-processing needed
      const processedElements = this.postProcessElements(positionedElements, designContext, constraints);

      // Create result object
      const finalResult: GenerationResult = {
        requestId,
        generatedElements: processedElements,
        originalDescription: description,
        designContext,
        appliedConstraints: constraints,
        metadata: {
          processingTimeMs: performance.now() - startTime,
          elementCount: processedElements.length,
          confidenceScore: result.confidenceScore || 0.8,
          modelUsed: result.modelUsed || this.modelName
        },
        fromCache: false
      };

      // Cache the result if enabled
      if (options.useCache !== false) {
        const cacheKey = this.generateCacheKey(description, existingElements, constraints);
        aiCache.set(cacheKey, finalResult, options.cacheTTL || 3600); // Default 1 hour TTL
      }

      // Track success analytics
      aiAnalytics.trackEvent({
        eventType: "request",
        eventName: "contextual_generation_success",

        duration: performance.now() - startTime,
        metadata: {
          requestId,
          generatedElementCount: processedElements.length
        }
      });

      logger.error(`Completed contextual generation ${requestId}`, {
        elementCount: processedElements.length,
        processingTime: Math.round(performance.now() - startTime)
      });

      return finalResult;
    } catch (error) {
      // Handle errors and provide fallback if possible
      logger.error(`Error in contextual generation ${requestId}`, {
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined
      });

      // Track error analytics
      aiAnalytics.trackEvent({
        eventType: "error",
        eventName: "contextual_generation_error",

        duration: performance.now() - startTime,
        metadata: {
          requestId,
          error: error instanceof Error ? error.message : "Unknown error"
        }
      });

      // Attempt fallback generation if requested
      if (options.fallbackOnError) {
        logger.error(`Attempting fallback generation for ${requestId}`);
        return this.fallbackGeneration(description, existingElements, constraints, {
          ...options,
          useCache: false // Don't use cache for fallback
        });
      }

      throw error;
    }
  }

  /**
   * Extract design context from existing elements
   */
  private async extractDesignContext(elements: Element[]): Promise<DesignContext> {
    logger.error("Extracting design context", { elementCount: elements.length });

    if (elements.length === 0) {
      return this.getDefaultDesignContext();
    }

    try {
      // Use ML service to analyze the CAD model
      const analysis = await mlService.analyzeCADModel(elements);

      // Calculate bounding box
      const boundingBox = this.calculateBoundingBox(elements);

      // Calculate style metrics
      const styleMetrics = this.extractStyleMetrics(elements);

      // Calculate spatial relationships
      const spatialRelationships = this.analyzeSpatialRelationships(elements);

      return {
        complexity: analysis.complexity,
        features: analysis.features,
        elementTypes: this.getElementTypeCounts(elements),
        boundingBox,
        styleMetrics,
        spatialRelationships,
        designSystem: this.inferDesignSystem(elements, styleMetrics),
        scale: this.determineModelScale(boundingBox),
        metadata: {
          elementCount: elements.length,
          dominantColor: styleMetrics.dominantColor,
          timestamp: Date.now()
        }
      };
    } catch (error) {
      logger.error("Error extracting design context, using default", {
        error: error instanceof Error ? error.message : "Unknown error"
      });

      // Fallback to basic context extraction
      return this.extractBasicDesignContext(elements);
    }
  }

  /**
   * Generate CAD elements using contextual information
   */
  private async generateWithContext(
    description: string,
    existingElements: Element[],
    designContext: DesignContext,
    constraints: GenerationConstraints,
    options: GenerationOptions
  ): Promise<{
    generatedElements: Element[];
    confidenceScore?: number;
    modelUsed?: string;
  }> {
    // Prepare system prompt for contextual generation
    const systemPrompt = this.buildSystemPrompt(designContext);

    // Prepare user prompt with context and constraints
    const userPrompt = this.buildUserPrompt(description, designContext, constraints);

    // Optional enhancement: Add examples if available
    const examplesPrompt = options.includeExamples ? this.getContextualExamples(designContext) : "";

    const finalPrompt = examplesPrompt + userPrompt;

    // Request with timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Generation request timed out")), this.requestTimeout);
    });

    const generationPromise = unifiedAIService.processRequest({
      prompt: finalPrompt,
      systemPrompt,
      model: options.modelOverride as AIModelType,
      temperature: options.temperature || 0.4, // Lower temperature for more predictable results
      maxTokens: options.maxTokens || 4000,
      parseResponse: this.parseGenerationResponse
    });

    // Race the promises to handle timeouts
    const response = await Promise.race([generationPromise, timeoutPromise]);

    if (!response.success || !response.data || !Array.isArray(response.data)) {
      throw new Error(`Failed to generate elements: ${response.error || "Invalid response format"}`);
    }

    // Validate generated elements
    const validationResult = validateCADElements(response.data);
    if (!validationResult.valid) {
      logger.error("Generated elements failed validation", {
        errors: validationResult.errors
      });

      // Attempt to fix if requested
      if (options.attemptFix && validationResult.errors.length > 0) {
        const fixedElements = await this.fixGeneratedElements(
          response.data,
          validationResult.errors,
          description,
          designContext
        );

        return {
          generatedElements: fixedElements,
          confidenceScore: 0.7, // Lower confidence for fixed elements
          modelUsed: response.model
        };
      }

      throw new Error(`Generated elements failed validation: ${validationResult.errors.join(", ")}`);
    }

    // Add unique IDs to elements if not present
    const elementsWithIds = response.data.map(el => ({
      ...el,
      id: el.id || `gen_${uuidv4()}`
    }));

    return {
      generatedElements: elementsWithIds,
      confidenceScore: 0.9, // High confidence for valid elements
      modelUsed: response.model
    };
  }

  /**
   * Position new elements appropriately relative to existing elements
   */
  private positionElements(
    newElements: Element[],
    existingElements: Element[],
    positioningStrategy: "adjacent" | "smart" | "centered" | "origin" | "custom"
  ): Element[] {
    if (newElements.length === 0) return [];
    if (existingElements.length === 0 || positioningStrategy === "origin") {
      // If no existing elements or origin strategy, place at (0,0,0)
      return newElements.map(el => ({
        ...el,
        x: 0,
        y: 0,
        z: 0
      }));
    }

    // Calculate existing bounding box
    const boundingBox = this.calculateBoundingBox(existingElements);

    // Calculate new elements bounding box
    const newBoundingBox = this.calculateBoundingBox(newElements);

    const centerExisting = {
      x: (boundingBox.max.x + boundingBox.min.x) / 2,
      y: (boundingBox.max.y + boundingBox.min.y) / 2,
      z: (boundingBox.max.z + boundingBox.min.z) / 2
    };

    const centerNew = {
      x: (newBoundingBox.max.x + newBoundingBox.min.x) / 2,
      y: (newBoundingBox.max.y + newBoundingBox.min.y) / 2,
      z: (newBoundingBox.max.z + newBoundingBox.min.z) / 2
    };

    switch (positioningStrategy) {
      case "centered":
        // Place new elements centered at the same position as existing elements
        return this.centerElements(newElements, centerExisting, centerNew);

      case "adjacent":
        // Place new elements adjacent to existing elements (non-overlapping)
        return this.placeAdjacent(newElements, boundingBox, newBoundingBox);

      case "smart":
      default:
        // Try to infer the best positioning based on the elements
        return this.smartPositioning(newElements, existingElements, boundingBox, newBoundingBox);
    }
  }

  /**
   * Apply post-processing to the generated elements
   */
  private postProcessElements(
    elements: Element[],
    designContext: DesignContext,
    constraints: GenerationConstraints
  ): Element[] {
    // Apply any necessary post-processing
    let processedElements = [...elements];

    // Apply style consistency if needed
    if (constraints.enforceStyleConsistency) {
      processedElements = this.enforceStyleConsistency(processedElements, designContext.styleMetrics);
    }

    // Apply scaling if needed
    if (constraints.scaleToMatch) {
      const scaleFactor = this.calculateScaleFactor(processedElements, designContext.scale);

      processedElements = this.scaleElements(processedElements, scaleFactor);
    }

    // Apply naming convention
    processedElements = this.applyNamingConvention(processedElements, constraints.namePrefix || "Generated");

    return processedElements;
  }

  /**
   * Generate a cache key for a specific generation request
   */
  private generateCacheKey(description: string, elements: Element[], constraints: GenerationConstraints): string {
    // Create a simplified representation of elements for the cache key
    const elementSummary = elements.map(el => ({
      type: el.type,
      x: Math.round(el.x),
      y: Math.round(el.y),
      z: Math.round(el.z)
    }));

    // Create a stable representation of the request
    const requestData = {
      description,
      elementSummary,
      constraintKeys: Object.keys(constraints).sort().join(",")
    };

    // Generate a hash of the request data
    const hash = this.hashString(JSON.stringify(requestData));

    return `${this.cacheKeyPrefix}${hash}`;
  }

  /**
   * Simple string hashing function for cache keys
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Calculate bounding box for a set of elements
   */
  private calculateBoundingBox(elements: Element[]): {
    min: { x: number; y: number; z: number };
    max: { x: number; y: number; z: number };
  } {
    if (elements.length === 0) {
      return {
        min: { x: 0, y: 0, z: 0 },
        max: { x: 0, y: 0, z: 0 }
      };
    }

    const min = { x: Infinity, y: Infinity, z: Infinity };
    const max = { x: -Infinity, y: -Infinity, z: -Infinity };

    elements.forEach(el => {
      // Handle different element types
      let halfWidth = 0,
        halfHeight = 0,
        halfDepth = 0;

      if ("width" in el && "height" in el && "depth" in el) {
        halfWidth = el.width / 2;
        halfHeight = el.height / 2;
        halfDepth = el.depth / 2;
      } else if ("radius" in el) {
        halfWidth = el.radius;
        halfHeight = el.radius;
        halfDepth = el.radius;
      }

      // Update min/max
      min.x = Math.min(min.x, el.x - halfWidth);
      min.y = Math.min(min.y, el.y - halfHeight);
      min.z = Math.min(min.z, el.z - halfDepth);

      max.x = Math.max(max.x, el.x + halfWidth);
      max.y = Math.max(max.y, el.y + halfHeight);
      max.z = Math.max(max.z, el.z + halfDepth);
    });

    return { min, max };
  }

  /**
   * Extract style metrics from elements
   */
  private extractStyleMetrics(elements: Element[]): {
    colorPalette: string[];
    dominantColor: string;
    cornerStyle: "sharp" | "rounded" | "mixed";
    surfaceFinish: "smooth" | "textured" | "mixed";
    proportions: "uniform" | "varied";
    symmetry: "symmetric" | "asymmetric" | "partial";
  } {
    // Define types explicitly for mutable properties
    type CornerStyle = "sharp" | "rounded" | "mixed";
    type SurfaceFinish = "smooth" | "textured" | "mixed";
    type Proportions = "uniform" | "varied";
    type Symmetry = "symmetric" | "asymmetric" | "partial";

    // Default values
    const metrics = {
      colorPalette: [] as string[],
      dominantColor: "#CCCCCC",
      cornerStyle: "mixed" as CornerStyle,
      surfaceFinish: "smooth" as SurfaceFinish,
      proportions: "varied" as Proportions,
      symmetry: "asymmetric" as Symmetry
    };

    if (elements.length === 0) return metrics;

    // Extract colors
    const colorCount: Record<string, number> = {};
    elements.forEach(el => {
      if (el.color) {
        colorCount[el.color] = (colorCount[el.color] || 0) + 1;
      }
    });

    metrics.colorPalette = Object.keys(colorCount);

    if (metrics.colorPalette.length > 0) {
      metrics.dominantColor = Object.entries(colorCount).sort((a, b) => b[1] - a[1])[0][0];
    }

    // Detect corner style
    const hasRoundedElements = elements.some(
      el => el.type === "sphere" || el.type === "cylinder" || el.type === "torus"
    );

    const hasSharpElements = elements.some(el => el.type === "cube" || el.type === "prism");

    if (hasRoundedElements && !hasSharpElements) {
      metrics.cornerStyle = "rounded";
    } else if (hasSharpElements && !hasRoundedElements) {
      metrics.cornerStyle = "sharp";
    }

    // Analyze proportions
    const dimensions = elements
      .map(el => {
        if ("width" in el && "height" in el && "depth" in el) {
          return [el.width, el.height, el.depth];
        }
        return [];
      })
      .filter(dims => dims.length > 0);

    const ratios = new Set();
    dimensions.forEach(dims => {
      const [w, h, d] = dims;
      if (w && h) ratios.add(Math.round((w / h) * 10) / 10);
      if (w && d) ratios.add(Math.round((w / d) * 10) / 10);
      if (h && d) ratios.add(Math.round((h / d) * 10) / 10);
    });

    if (ratios.size <= 2) {
      metrics.proportions = "varied";
    }

    // Analyze symmetry
    const bbox = this.calculateBoundingBox(elements);
    const center = {
      x: (bbox.max.x + bbox.min.x) / 2,
      y: (bbox.max.y + bbox.min.y) / 2,
      z: (bbox.max.z + bbox.min.z) / 2
    };

    const elementsByQuadrant: Record<string, number> = {
      "+++": 0,
      "++−": 0,
      "+−+": 0,
      "+−−": 0,
      "−++": 0,
      "−+−": 0,
      "−−+": 0,
      "−−−": 0
    };

    elements.forEach(el => {
      const quadrant = (el.x >= center.x ? "+" : "−") + (el.y >= center.y ? "+" : "−") + (el.z >= center.z ? "+" : "−");

      elementsByQuadrant[quadrant] = (elementsByQuadrant[quadrant] || 0) + 1;
    });

    const quadrantCounts = Object.values(elementsByQuadrant);
    const maxCount = Math.max(...quadrantCounts);
    const minCount = Math.min(...quadrantCounts);
    if (maxCount === minCount && minCount > 0) {
      // Ensure non-zero counts for symmetry
      metrics.symmetry = "symmetric";
    } else if (maxCount / minCount < 2 && maxCount > 0) {
      // Relaxed symmetry check
      metrics.symmetry = "partial";
    } else {
      // Default to asymmetric if not clearly symmetric or partially symmetric
      metrics.symmetry = "asymmetric";
    }
    return metrics;
  }

  /**
   * Analyze spatial relationships between elements
   */
  private analyzeSpatialRelationships(elements: Element[]): {
    primaryAxis: "x" | "y" | "z" | "none";
    connections: { type: string; count: number }[];
    hierarchy: "flat" | "nested" | "layered";
    density: number; // 0-1 scale
  } {
    if (elements.length <= 1) {
      return {
        primaryAxis: "none",
        connections: [],
        hierarchy: "flat",
        density: 0
      };
    }

    // Determine primary axis of arrangement
    const xSpread = this.calculateAxisSpread(elements, "x");
    const ySpread = this.calculateAxisSpread(elements, "y");
    const zSpread = this.calculateAxisSpread(elements, "z");

    let primaryAxis: "x" | "y" | "z" | "none" = "none";
    const maxSpread = Math.max(xSpread, ySpread, zSpread);

    if (maxSpread === xSpread && xSpread > 0) primaryAxis = "x";
    else if (maxSpread === ySpread && ySpread > 0) primaryAxis = "y";
    else if (maxSpread === zSpread && zSpread > 0) primaryAxis = "z";

    // Analyze connections between elements
    const connections: { type: string; count: number }[] = [];
    const bbox = this.calculateBoundingBox(elements);
    const volume = this.calculateVolume(bbox);

    // Calculate density
    const elementsVolume = elements.reduce((sum, el) => {
      if ("width" in el && "height" in el && "depth" in el) {
        return sum + el.width * el.height * el.depth;
      } else if ("radius" in el) {
        return sum + (4 / 3) * Math.PI * Math.pow(el.radius, 3);
      }
      return sum;
    }, 0);

    const density = volume > 0 ? Math.min(1, elementsVolume / volume) : 0;

    // Determine hierarchy
    let hierarchy: "flat" | "nested" | "layered" = "flat";
    const zLevels = new Set(elements.map(el => Math.round(el.z / 10) * 10));

    if (zLevels.size > 2) {
      hierarchy = "layered";
    }

    // Check for nesting
    const containments = this.checkForContainments(elements);
    if (containments > 0) {
      hierarchy = "nested";
    }

    return {
      primaryAxis,
      connections,
      hierarchy,
      density
    };
  }

  /**
   * Calculate spread along an axis
   */
  private calculateAxisSpread(elements: Element[], axis: "x" | "y" | "z"): number {
    const values = elements.map(el => el[axis]);
    return Math.max(...values) - Math.min(...values);
  }

  /**
   * Calculate volume of a bounding box
   */
  private calculateVolume(bbox: {
    min: { x: number; y: number; z: number };
    max: { x: number; y: number; z: number };
  }): number {
    const width = bbox.max.x - bbox.min.x;
    const height = bbox.max.y - bbox.min.y;
    const depth = bbox.max.z - bbox.min.z;

    return width * height * depth;
  }

  /**
   * Check for containment relationships between elements
   */
  private checkForContainments(elements: Element[]): number {
    let containments = 0;

    for (let i = 0; i < elements.length; i++) {
      const el1 = elements[i];

      for (let j = 0; j < elements.length; j++) {
        if (i === j) continue;

        const el2 = elements[j];

        // Simple containment check based on bounding boxes
        if (this.isContained(el1, el2)) {
          containments++;
        }
      }
    }

    return containments;
  }

  /**
   * Check if element A is contained within element B
   */
  private isContained(inner: Element, outer: Element): boolean {
    // Get inner element bounds
    let innerMinX, innerMaxX, innerMinY, innerMaxY, innerMinZ, innerMaxZ;

    if ("width" in inner && "height" in inner && "depth" in inner) {
      innerMinX = inner.x - inner.width / 2;
      innerMaxX = inner.x + inner.width / 2;
      innerMinY = inner.y - inner.height / 2;
      innerMaxY = inner.y + inner.height / 2;
      innerMinZ = inner.z - inner.depth / 2;
      innerMaxZ = inner.z + inner.depth / 2;
    } else if ("radius" in inner) {
      innerMinX = inner.x - inner.radius;
      innerMaxX = inner.x + inner.radius;
      innerMinY = inner.y - inner.radius;
      innerMaxY = inner.y + inner.radius;
      innerMinZ = inner.z - inner.radius;
      innerMaxZ = inner.z + inner.radius;
    } else {
      return false;
    }

    // Get outer element bounds
    let outerMinX, outerMaxX, outerMinY, outerMaxY, outerMinZ, outerMaxZ;

    if ("width" in outer && "height" in outer && "depth" in outer) {
      outerMinX = outer.x - outer.width / 2;
      outerMaxX = outer.x + outer.width / 2;
      outerMinY = outer.y - outer.height / 2;
      outerMaxY = outer.y + outer.height / 2;
      outerMinZ = outer.z - outer.depth / 2;
      outerMaxZ = outer.z + outer.depth / 2;
    } else if ("radius" in outer) {
      outerMinX = outer.x - outer.radius;
      outerMaxX = outer.x + outer.radius;
      outerMinY = outer.y - outer.radius;
      outerMaxY = outer.y + outer.radius;
      outerMinZ = outer.z - outer.radius;
      outerMaxZ = outer.z + outer.radius;
    } else {
      return false;
    }

    // Check if inner is contained within outer
    return (
      innerMinX >= outerMinX &&
      innerMaxX <= outerMaxX &&
      innerMinY >= outerMinY &&
      innerMaxY <= outerMaxY &&
      innerMinZ >= outerMinZ &&
      innerMaxZ <= outerMaxZ
    );
  }

  /**
   * Infer design system from elements and style metrics
   */
  private inferDesignSystem(
    elements: Element[],
    styleMetrics: ReturnType<typeof this.extractStyleMetrics>
  ): {
    type: "mechanical" | "organic" | "architectural" | "abstract" | "unknown";
    gridSize: number | null;
    modularity: number; // 0-1 scale
  } {
    // Default values
    const designSystem = {
      type: "unknown" as "mechanical" | "organic" | "architectural" | "abstract" | "unknown",
      gridSize: null as number | null,
      modularity: 0
    };

    if (elements.length === 0) return designSystem;

    // Check for grid alignment
    const xPositions = elements.map(el => el.x);
    const yPositions = elements.map(el => el.y);
    const zPositions = elements.map(el => el.z);

    // Try to detect if elements snap to a grid
    const possibleGridSizes = [1, 5, 10, 25, 50, 100];
    let bestGridScore = 0;
    let bestGridSize = null;

    for (const gridSize of possibleGridSizes) {
      const xAligned = xPositions.filter(x => Math.round((x % gridSize) * 100) / 100 === 0).length;
      const yAligned = yPositions.filter(y => Math.round((y % gridSize) * 100) / 100 === 0).length;
      const zAligned = zPositions.filter(z => Math.round((z % gridSize) * 100) / 100 === 0).length;

      const totalPositions = xPositions.length + yPositions.length + zPositions.length;
      const alignedPositions = xAligned + yAligned + zAligned;
      const score = alignedPositions / totalPositions;

      if (score > bestGridScore && score > 0.5) {
        bestGridScore = score;
        bestGridSize = gridSize;
      }
    }

    designSystem.gridSize = bestGridSize;

    // Determine modularity by looking at repeated dimensions
    const dimensions: number[] = [];
    elements.forEach(el => {
      if ("width" in el) dimensions.push(el.width);
      if ("height" in el) dimensions.push(el.height);
      if ("depth" in el) dimensions.push(el.depth);
      if ("radius" in el) dimensions.push(el.radius);
    });

    const uniqueDimensions = new Set(dimensions.map(d => Math.round(d * 10) / 10));
    designSystem.modularity = 1 - uniqueDimensions.size / Math.max(1, dimensions.length);

    // Determine design system type
    const rectangularCount = elements.filter(el => el.type === "cube" || el.type === "prism").length;
    const cylindricalCount = elements.filter(el => el.type === "cylinder").length;
    const sphericalCount = elements.filter(el => el.type === "sphere").length;
    const organicCount = elements.filter(el => el.type === "spline" || el.type === "torus").length;

    const total = elements.length;

    if ((rectangularCount + cylindricalCount) / total > 0.7 && designSystem.modularity > 0.5) {
      designSystem.type = "mechanical";
    } else if (sphericalCount / total > 0.4 || organicCount / total > 0.3) {
      designSystem.type = "organic";
    } else if (rectangularCount / total > 0.6 && styleMetrics.symmetry === "symmetric") {
      designSystem.type = "architectural";
    } else if (styleMetrics.proportions === "varied" && styleMetrics.symmetry === "asymmetric") {
      designSystem.type = "abstract";
    }

    return designSystem;
  }

  /**
   * Determine model scale based on bounding box
   */
  private determineModelScale(boundingBox: ReturnType<typeof this.calculateBoundingBox>): {
    category: "microscopic" | "small" | "medium" | "large" | "architectural" | "unknown";
    maxDimension: number;
    typicalUnit: "mm" | "cm" | "m" | "unknown";
  } {
    const width = boundingBox.max.x - boundingBox.min.x;
    const height = boundingBox.max.y - boundingBox.min.y;
    const depth = boundingBox.max.z - boundingBox.min.z;

    const maxDimension = Math.max(width, height, depth);

    // Default scale
    const scale = {
      category: "unknown" as "microscopic" | "small" | "medium" | "large" | "architectural" | "unknown",
      maxDimension,
      typicalUnit: "mm" as "mm" | "cm" | "m" | "unknown"
    };

    // Categorize based on max dimension
    if (maxDimension < 1) {
      scale.category = "microscopic";
    } else if (maxDimension < 100) {
      scale.category = "small";
      scale.typicalUnit = "mm";
    } else if (maxDimension < 1000) {
      scale.category = "medium";
      scale.typicalUnit = "mm";
    } else if (maxDimension < 10000) {
      scale.category = "large";
      scale.typicalUnit = "cm";
    } else {
      scale.category = "architectural";
      scale.typicalUnit = "m";
    }

    return scale;
  }

  /**
   * Center elements at a specific position
   */
  private centerElements(
    elements: Element[],
    targetCenter: { x: number; y: number; z: number },
    currentCenter: { x: number; y: number; z: number }
  ): Element[] {
    // Calculate translation vector
    const translation = {
      x: targetCenter.x - currentCenter.x,
      y: targetCenter.y - currentCenter.y,
      z: targetCenter.z - currentCenter.z
    };

    // Apply translation to all elements
    return elements.map(el => ({
      ...el,
      x: el.x + translation.x,
      y: el.y + translation.y,
      z: el.z + translation.z
    }));
  }

  /**
   * Place elements adjacent to existing elements
   */
  private placeAdjacent(
    elements: Element[],
    existingBBox: ReturnType<typeof this.calculateBoundingBox>,
    newBBox: ReturnType<typeof this.calculateBoundingBox>
  ): Element[] {
    // Calculate element dimensions
    const existingWidth = existingBBox.max.x - existingBBox.min.x;
    const existingDepth = existingBBox.max.z - existingBBox.min.z;

    const newWidth = newBBox.max.x - newBBox.min.x;
    const newHeight = newBBox.max.y - newBBox.min.y;

    // Calculate center of new elements
    const newCenter = {
      x: (newBBox.max.x + newBBox.min.x) / 2,
      y: (newBBox.max.y + newBBox.min.y) / 2,
      z: (newBBox.max.z + newBBox.min.z) / 2
    };

    // Calculate target position (next to existing elements on X axis)
    const targetCenter = {
      x: existingBBox.max.x + newWidth / 2 + 10, // 10 units spacing
      y: newCenter.y,
      z: (existingBBox.max.z + existingBBox.min.z) / 2
    };

    // Apply translation
    const translation = {
      x: targetCenter.x - newCenter.x,
      y: targetCenter.y - newCenter.y,
      z: targetCenter.z - newCenter.z
    };

    return elements.map(el => ({
      ...el,
      x: el.x + translation.x,
      y: el.y + translation.y,
      z: el.z + translation.z
    }));
  }

  /**
   * Apply smart positioning based on element analysis
   */
  private smartPositioning(
    newElements: Element[],
    existingElements: Element[],
    existingBBox: ReturnType<typeof this.calculateBoundingBox>,
    newBBox: ReturnType<typeof this.calculateBoundingBox>
  ): Element[] {
    // Analyze existing elements to determine best positioning
    const spatialRelations = this.analyzeSpatialRelationships(existingElements);

    // If existing elements have a primary axis, try to align along that axis
    if (spatialRelations.primaryAxis !== "none") {
      return this.alignWithAxis(newElements, existingElements, existingBBox, newBBox, spatialRelations.primaryAxis);
    }

    // If there's a clear hierarchy, try to follow it
    if (spatialRelations.hierarchy === "layered") {
      return this.stackOnTop(newElements, existingElements, existingBBox, newBBox);
    }

    // Default to adjacent placement if no clear pattern
    return this.placeAdjacent(newElements, existingBBox, newBBox);
  }

  /**
   * Align new elements with the primary axis of existing elements
   */
  private alignWithAxis(
    newElements: Element[],
    existingElements: Element[],
    existingBBox: ReturnType<typeof this.calculateBoundingBox>,
    newBBox: ReturnType<typeof this.calculateBoundingBox>,
    axis: "x" | "y" | "z"
  ): Element[] {
    // Calculate new element centers
    const newCenter = {
      x: (newBBox.max.x + newBBox.min.x) / 2,
      y: (newBBox.max.y + newBBox.min.y) / 2,
      z: (newBBox.max.z + newBBox.min.z) / 2
    };

    // Calculate existing element centers
    const existingCenter = {
      x: (existingBBox.max.x + existingBBox.min.x) / 2,
      y: (existingBBox.max.y + existingBBox.min.y) / 2,
      z: (existingBBox.max.z + existingBBox.min.z) / 2
    };

    // Calculate target position based on axis
    const targetCenter = { ...newCenter };

    switch (axis) {
      case "x":
        // Place along X axis, maintain other dimensions
        targetCenter.x = existingBBox.max.x + (newBBox.max.x - newBBox.min.x) / 2 + 10;
        targetCenter.y = existingCenter.y;
        targetCenter.z = existingCenter.z;
        break;

      case "y":
        // Place along Y axis, maintain other dimensions
        targetCenter.x = existingCenter.x;
        targetCenter.y = existingBBox.max.y + (newBBox.max.y - newBBox.min.y) / 2 + 10;
        targetCenter.z = existingCenter.z;
        break;

      case "z":
        // Place along Z axis, maintain other dimensions
        targetCenter.x = existingCenter.x;
        targetCenter.y = existingCenter.y;
        targetCenter.z = existingBBox.max.z + (newBBox.max.z - newBBox.min.z) / 2 + 10;
        break;
    }

    // Calculate translation
    const translation = {
      x: targetCenter.x - newCenter.x,
      y: targetCenter.y - newCenter.y,
      z: targetCenter.z - newCenter.z
    };

    // Apply translation
    return newElements.map(el => ({
      ...el,
      x: el.x + translation.x,
      y: el.y + translation.y,
      z: el.z + translation.z
    }));
  }

  /**
   * Stack new elements on top of existing ones
   */
  private stackOnTop(
    newElements: Element[],
    existingElements: Element[],
    existingBBox: ReturnType<typeof this.calculateBoundingBox>,
    newBBox: ReturnType<typeof this.calculateBoundingBox>
  ): Element[] {
    // Calculate center points
    const newCenter = {
      x: (newBBox.max.x + newBBox.min.x) / 2,
      y: (newBBox.max.y + newBBox.min.y) / 2,
      z: (newBBox.max.z + newBBox.min.z) / 2
    };

    const existingCenter = {
      x: (existingBBox.max.x + existingBBox.min.x) / 2,
      y: (existingBBox.max.y + existingBBox.min.y) / 2,
      z: (existingBBox.max.z + existingBBox.min.z) / 2
    };

    // Place on top (higher Z)
    const targetCenter = {
      x: existingCenter.x,
      y: existingCenter.y,
      z: existingBBox.max.z + (newBBox.max.z - newBBox.min.z) / 2 + 5 // 5 units spacing
    };

    // Calculate translation
    const translation = {
      x: targetCenter.x - newCenter.x,
      y: targetCenter.y - newCenter.y,
      z: targetCenter.z - newCenter.z
    };

    // Apply translation
    return newElements.map(el => ({
      ...el,
      x: el.x + translation.x,
      y: el.y + translation.y,
      z: el.z + translation.z
    }));
  }

  /**
   * Enforce style consistency on generated elements
   */
  private enforceStyleConsistency(
    elements: Element[],
    styleMetrics: ReturnType<typeof this.extractStyleMetrics>
  ): Element[] {
    return elements.map(el => {
      // Apply consistent color if needed
      let updatedElement = { ...el };

      if (styleMetrics.colorPalette.length > 0 && !styleMetrics.colorPalette.includes(el.color || "")) {
        updatedElement.color = styleMetrics.dominantColor;
      }

      return updatedElement;
    });
  }

  /**
   * Calculate scale factor to match existing elements
   */
  private calculateScaleFactor(elements: Element[], scale: ReturnType<typeof this.determineModelScale>): number {
    // Calculate current average dimensions
    const dimensions: number[] = [];

    elements.forEach(el => {
      if ("width" in el) dimensions.push(el.width);
      if ("height" in el) dimensions.push(el.height);
      if ("depth" in el) dimensions.push(el.depth);
      if ("radius" in el) dimensions.push(el.radius * 2);
    });

    if (dimensions.length === 0) return 1;

    const averageDimension = dimensions.reduce((sum, dim) => sum + dim, 0) / dimensions.length;

    // Determine target scale based on category
    let targetAverage: number;

    switch (scale.category) {
      case "microscopic":
        targetAverage = 0.05;
        break;
      case "small":
        targetAverage = 0.5;
        break;
      case "medium":
        targetAverage = 5;
        break;
      case "large":
        targetAverage = 20;
        break;
      case "architectural":
        targetAverage = 50;
        break;
      default:
        return 1; // No scaling if unknown
    }

    // Calculate scale factor
    return averageDimension > 0 ? targetAverage / averageDimension : 1;
  }

  /**
   * Scale elements by a factor
   */
  private scaleElements(elements: Element[], factor: number): Element[] {
    if (factor === 1) return elements;

    return elements.map(el => {
      const scaled = { ...el };

      // Scale dimensions
      if ("width" in scaled) scaled.width *= factor;
      if ("height" in scaled) scaled.height *= factor;
      if ("depth" in scaled) scaled.depth *= factor;
      if ("radius" in scaled) scaled.radius *= factor;

      // Scale position (relative to center)
      scaled.x *= factor;
      scaled.y *= factor;
      scaled.z *= factor;

      return scaled;
    });
  }

  /**
   * Apply naming convention to elements
   */
  private applyNamingConvention(elements: Element[], prefix: string): Element[] {
    return elements.map((el, index) => ({
      ...el,
      name: el.name || `${prefix}_${el.type}_${index + 1}`
    }));
  }

  /**
   * Get element type counts
   */
  private getElementTypeCounts(elements: Element[]): Record<string, number> {
    const counts: Record<string, number> = {};

    elements.forEach(el => {
      counts[el.type] = (counts[el.type] || 0) + 1;
    });

    return counts;
  }

  /**
   * Get primary element types
   */
  private getPrimaryElementTypes(elements: Element[]): string[] {
    const counts = this.getElementTypeCounts(elements);

    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([type]) => type);
  }

  /**
   * Get default design context
   */
  private getDefaultDesignContext(): DesignContext {
    return {
      complexity: 0.5,
      features: [],
      elementTypes: {},
      boundingBox: {
        min: { x: 0, y: 0, z: 0 },
        max: { x: 0, y: 0, z: 0 }
      },
      styleMetrics: {
        colorPalette: ["#CCCCCC"],
        dominantColor: "#CCCCCC",
        cornerStyle: "mixed",
        surfaceFinish: "smooth",
        proportions: "uniform",
        symmetry: "symmetric"
      },
      spatialRelationships: {
        primaryAxis: "none",
        connections: [],
        hierarchy: "flat",
        density: 0
      },
      designSystem: {
        type: "unknown",
        gridSize: null,
        modularity: 0
      },
      scale: {
        category: "medium",
        maxDimension: 100,
        typicalUnit: "mm"
      },
      metadata: {
        elementCount: 0,
        dominantColor: "#CCCCCC",
        timestamp: Date.now()
      }
    };
  }

  /**
   * Extract basic design context when ML service fails
   */
  private extractBasicDesignContext(elements: Element[]): DesignContext {
    const bbox = this.calculateBoundingBox(elements);
    const typeCounts = this.getElementTypeCounts(elements);

    return {
      complexity: elements.length > 10 ? 0.7 : 0.4,
      features: [],
      elementTypes: typeCounts,
      boundingBox: bbox,
      styleMetrics: {
        colorPalette: Array.from(new Set(elements.map(el => el.color || "#CCCCCC"))),
        dominantColor: "#CCCCCC",
        cornerStyle: "mixed",
        surfaceFinish: "smooth",
        proportions: "uniform",
        symmetry: "symmetric"
      },
      spatialRelationships: {
        primaryAxis: "none",
        connections: [],
        hierarchy: "flat",
        density: 0.5
      },
      designSystem: {
        type: "unknown",
        gridSize: null,
        modularity: 0.5
      },
      scale: {
        category: "medium",
        maxDimension: Math.max(bbox.max.x - bbox.min.x, bbox.max.y - bbox.min.y, bbox.max.z - bbox.min.z),
        typicalUnit: "mm"
      },
      metadata: {
        elementCount: elements.length,
        dominantColor: "#CCCCCC",
        timestamp: Date.now()
      }
    };
  }

  /**
   * Build system prompt for generation based on design context
   */
  private buildSystemPrompt(designContext: DesignContext): string {
    return `You are an expert CAD designer specializing in creating contextually appropriate 3D models. You analyze existing designs and generate new components that complement them well.

Current Design Context:
- Complexity: ${designContext.complexity}/1.0
- Design Type: ${designContext.designSystem.type}
- Primary Element Types: ${Object.entries(designContext.elementTypes)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([type, count]) => `${type} (${count})`)
      .join(", ")}
- Style: ${designContext.styleMetrics.cornerStyle} corners, ${designContext.styleMetrics.symmetry} symmetry
- Scale: ${designContext.scale.category} (typical unit: ${designContext.scale.typicalUnit})
- Color Palette: ${designContext.styleMetrics.colorPalette.join(", ")}

You must generate 3D elements as valid JSON objects with the following properties:
- type: The element type (cube, sphere, cylinder, etc.)
- x, y, z: Position coordinates (in mm)
- width, height, depth: For rectangular elements (in mm)
- radius: For circular elements (in mm)
- rotation: { x, y, z } in degrees
- color: Hex color code
- name: Descriptive name

Your output should ONLY contain a valid JSON array of elements with NO explanation or additional text.`;
  }

  /**
   * Build user prompt for generation
   */
  private buildUserPrompt(
    description: string,
    designContext: DesignContext,
    constraints: GenerationConstraints
  ): string {
    let prompt = `Generate CAD elements based on this description: "${description}"

These elements should complement the existing design with the following characteristics:
- ${designContext.elementTypes ? `Contains primarily ${Object.keys(designContext.elementTypes).join(", ")} elements` : "No existing elements"}
- ${designContext.features.length > 0 ? `Features: ${designContext.features.join(", ")}` : "No specific features"}
- ${designContext.styleMetrics.cornerStyle} corner style
- ${designContext.styleMetrics.symmetry} symmetry
- Scale category: ${designContext.scale.category}
- Color palette: ${designContext.styleMetrics.colorPalette.join(", ")}`;

    // Add constraints if provided
    if (Object.keys(constraints).length > 0) {
      prompt += "\n\nPlease follow these specific constraints:";

      if (constraints.maxElements) {
        prompt += `\n- Generate maximum ${constraints.maxElements} elements`;
      }

      if (constraints.enforceStyleConsistency) {
        prompt += `\n- Strictly follow the existing style guidelines`;
      }

      if (constraints.preferredTypes && constraints.preferredTypes.length > 0) {
        prompt += `\n- Preferred element types: ${constraints.preferredTypes.join(", ")}`;
      }

      if (constraints.colorPalette && constraints.colorPalette.length > 0) {
        prompt += `\n- Use only these colors: ${constraints.colorPalette.join(", ")}`;
      }

      if (constraints.maxDimensions) {
        prompt += `\n- Maximum dimensions: ${constraints.maxDimensions.width}x${constraints.maxDimensions.height}x${constraints.maxDimensions.depth} mm`;
      }

      if (constraints.symmetryType) {
        prompt += `\n- Use ${constraints.symmetryType} symmetry`;
      }
    }

    prompt +=
      "\n\nRespond ONLY with a valid JSON array of element objects. Do not include any explanations or other text.";

    return prompt;
  }

  /**
   * Get contextual examples for generation
   */
  private getContextualExamples(designContext: DesignContext): string {
    // Return examples tailored to the design context
    const examplesByType: Record<string, string> = {
      mechanical: `Example 1: A mechanical assembly with gears and mounting brackets
[
  {
    "type": "cylinder",
    "x": 0,
    "y": 0,
    "z": 0,
    "radius": 50,
    "height": 10,
    "rotation": { "x": 0, "y": 0, "z": 0 },
    "color": "#7A7A7A",
    "name": "Base Plate"
  },
  {
    "type": "cylinder",
    "x": 0,
    "y": 0,
    "z": 15,
    "radius": 20,
    "height": 20,
    "rotation": { "x": 0, "y": 0, "z": 0 },
    "color": "#505050",
    "name": "Gear Hub"
  }
]

`,
      organic: `Example 1: An organic vase with flowing curves
[
  {
    "type": "cylinder",
    "x": 0,
    "y": 0,
    "z": 0,
    "radius": 40,
    "height": 10,
    "rotation": { "x": 0, "y": 0, "z": 0 },
    "color": "#A67C52",
    "name": "Vase Base"
  },
  {
    "type": "spline",
    "x": 0,
    "y": 0,
    "z": 50,
    "points": [
      {"x": -40, "y": 0, "z": 0},
      {"x": -30, "y": 20, "z": 20},
      {"x": -20, "y": 40, "z": 40},
      {"x": 0, "y": 50, "z": 50},
      {"x": 20, "y": 40, "z": 40},
      {"x": 30, "y": 20, "z": 20},
      {"x": 40, "y": 0, "z": 0}
    ],
    "thickness": 5,
    "color": "#A67C52",
    "name": "Vase Curve"
  }
]

`,
      architectural: `Example 1: A simple building structure
[
  {
    "type": "cube",
    "x": 0,
    "y": 0,
    "z": 0,
    "width": 500,
    "height": 300,
    "depth": 500,
    "rotation": { "x": 0, "y": 0, "z": 0 },
    "color": "#E0E0E0",
    "name": "Building Base"
  },
  {
    "type": "cube",
    "x": 0,
    "y": 175,
    "z": 0,
    "width": 550,
    "height": 50,
    "depth": 550,
    "rotation": { "x": 0, "y": 0, "z": 0 },
    "color": "#C0C0C0",
    "name": "Roof Overhang"
  }
]

`
    };

    // Return appropriate example based on design system type
    return examplesByType[designContext.designSystem.type] || "";
  }

  /**
   * Parse AI response into CAD elements
   */
  private parseGenerationResponse = async (text: string): Promise<Element[]> => {
    try {
      // Try to extract JSON from the response
      const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/) || text.match(/\[\s*\{[\s\S]*\}\s*\]/);

      if (!jsonMatch) {
        throw new Error("No valid JSON found in response");
      }

      const json = jsonMatch[1] || jsonMatch[0];
      const parsed = JSON.parse(json);

      if (!Array.isArray(parsed)) {
        throw new Error("Expected JSON array of elements");
      }

      // Validate and normalize each element
      const elements = parsed.map((el: any) => ({
        id: el.id || `gen_${uuidv4()}`,
        x: el.x ?? 0,
        y: el.y ?? 0,
        z: el.z ?? 0,
        width: el.width ?? 50,
        height: el.height ?? 50,
        depth: el.depth ?? 50,
        radius: el.radius ?? 25,
        color: el.color ?? "#1e88e5",
        ...(el.rotation && {
          rotation: {
            x: el.rotation.x ?? 0,
            y: el.rotation.y ?? 0,
            z: el.rotation.z ?? 0
          }
        }),
        ...el
      }));

      return elements;
    } catch (error) {
      logger.error("Failed to parse generation response", {
        error: error instanceof Error ? error.message : "Unknown error",
        text: text.substring(0, 200) + (text.length > 200 ? "..." : "")
      });
      throw error;
    }
  };

  /**
   * Attempt to fix invalid elements
   */
  private async fixGeneratedElements(
    elements: Element[],
    errors: string[],
    originalDescription: string,
    designContext: DesignContext
  ): Promise<Element[]> {
    // Create a prompt to fix the elements
    const fixPrompt = `The following CAD elements have validation errors:
${JSON.stringify(elements, null, 2)}

Errors:
${errors.join("\n")}

Please fix these errors while maintaining the original intent: "${originalDescription}"

The elements should match these design parameters:
- Design type: ${designContext.designSystem.type}
- Element types: ${Object.keys(designContext.elementTypes).join(", ")}
- Style: ${designContext.styleMetrics.cornerStyle} corners, ${designContext.styleMetrics.proportions} proportions

Return ONLY the fixed elements as a valid JSON array.`;

    // Use AI to fix the elements
    const response = await unifiedAIService.processRequest({
      prompt: fixPrompt,
      systemPrompt: "You are a CAD validation expert who fixes invalid elements while preserving their design intent.",
      model: this.modelName as AIModelType,
      temperature: 0.2, // Low temperature for more predictable fixes
      parseResponse: this.parseGenerationResponse
    });

    if (response.success && response.data && Array.isArray(response.data)) {
      return response.data;
    }

    // If fixing failed, return a minimal valid set
    logger.error("Failed to fix elements, returning minimal set", {
      originalCount: elements.length
    });

    // Create a minimal valid element
    return [
      {
        id: `gen_${uuidv4()}`,
        type: "cube",
        x: 0,
        y: 0,
        z: 0,
        width: 50,
        height: 50,
        depth: 50,
        rotation: { x: 0, y: 0, z: 0 },
        color: designContext.styleMetrics.dominantColor,
        name: "Fallback Element",
        layerId: elements[0].layerId || `default_layer_${uuidv4()}`
      }
    ];
  }

  /**
   * Fallback generation when the primary method fails
   */
  private async fallbackGeneration(
    description: string,
    existingElements: Element[],
    constraints: GenerationConstraints,
    options: GenerationOptions
  ): Promise<GenerationResult> {
    logger.error("Using fallback generation", { description: description.substring(0, 100) });

    const startTime = performance.now();
    const requestId = uuidv4();

    try {
      // Create a simple prompt for fallback generation
      const fallbackPrompt = `Generate a simple CAD model described as: "${description}"
      
Use only basic shapes (cube, sphere, cylinder) and position them appropriately.
Return a JSON array of elements with the properties: type, x, y, z, width/radius, height, depth, color, rotation.`;

      const response = await unifiedAIService.processRequest({
        prompt: fallbackPrompt,
        systemPrompt: "You are a CAD generator that creates simple 3D models using basic shapes.",
        model: options.modelOverride as AIModelType, // Use a simpler model for fallback
        temperature: 0.7,
        parseResponse: this.parseGenerationResponse
      });

      if (!response.success || !response.data || !Array.isArray(response.data)) {
        throw new Error(`Fallback generation failed: ${response.error || "Invalid response"}`);
      }

      // Add IDs to elements
      const elementsWithIds = response.data.map(el => ({
        ...el,
        id: el.id || `fallback_${uuidv4()}`
      }));

      // Basic positioning at origin if no existing elements
      const positionedElements =
        existingElements.length === 0
          ? elementsWithIds
          : this.placeAdjacent(
              elementsWithIds,
              this.calculateBoundingBox(existingElements),
              this.calculateBoundingBox(elementsWithIds)
            );

      // Create a simple design context
      const basicContext = this.extractBasicDesignContext(existingElements);

      return {
        requestId,
        generatedElements: positionedElements,
        originalDescription: description,
        designContext: basicContext,
        appliedConstraints: constraints,
        metadata: {
          processingTimeMs: performance.now() - startTime,
          elementCount: positionedElements.length,
          confidenceScore: 0.5, // Lower confidence for fallback
          modelUsed: response.model || "fallback"
        },
        fromCache: false,
        fallbackUsed: true
      };
    } catch (error) {
      logger.error("Fallback generation failed", {
        error: error instanceof Error ? error.message : "Unknown error"
      });

      // Last resort: return a single default cube
      const defaultElement: Element = {
        id: `emergency_fallback_${uuidv4()}`,
        type: "cube",
        x: 0,
        y: 0,
        z: 0,
        width: 50,
        height: 50,
        depth: 50,
        rotation: { x: 0, y: 0, z: 0 },
        color: "#1e88e5",
        name: "Emergency Fallback Element",
        layerId: `emergency_fallback_${uuidv4()}` || `default_layer_${uuidv4()}`
      };

      return {
        requestId,
        generatedElements: [defaultElement],
        originalDescription: description,
        designContext: this.getDefaultDesignContext(),
        appliedConstraints: {},
        metadata: {
          processingTimeMs: performance.now() - startTime,
          elementCount: 1,
          confidenceScore: 0.1,
          modelUsed: "emergency_fallback",
          error: error instanceof Error ? error.message : "Unknown error"
        },
        fromCache: false,
        fallbackUsed: true,
        emergencyFallback: true
      };
    }
  }
}

export const contextAwareGenerationService = new ContextAwareGenerationService();

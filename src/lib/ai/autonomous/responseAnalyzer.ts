// =======================================================================================
// src/lib/ai/autonomous/responseAnalyzer.ts - Analizzatore qualità risposte
// =======================================================================================

import { QualityAnalysis, ErrorReport, Suggestion, CADContext } from "@/src/types/autonomousTypes";

export class ResponseAnalyzer {
  private qualityThresholds = {
    excellent: 90,
    good: 75,
    acceptable: 60,
    poor: 40
  };

  /**
   * Analizza la qualità complessiva di una risposta
   */
  async analyzeResponse(response: string, originalRequest: string, context: CADContext = {}): Promise<QualityAnalysis> {
    const startTime = Date.now();

    try {
      // Analisi parallele per efficienza
      const [completeness, accuracy, errors, confidence] = await Promise.all([
        this.analyzeCompleteness(response, originalRequest, context.elements || []),
        this.analyzeAccuracy(response, context),
        this.findErrors(response, context),
        this.calculateConfidence(response, originalRequest)
      ]);

      // Calcola score complessivo pesato
      const score = this.calculateOverallScore(completeness, accuracy, errors.length, confidence);

      // Genera suggerimenti basati sull'analisi
      const improvements = await this.generateSuggestions(
        response,
        {
          score,
          completeness,
          accuracy,
          errorCount: errors.length,
          errors,
          improvements: [],
          confidence,
          reasoning: this.generateReasoning(score, completeness, accuracy, errors, confidence)
        },
        originalRequest
      );

      const analysis: QualityAnalysis = {
        score,
        completeness,
        accuracy,
        errorCount: errors.length,
        errors,
        improvements,
        confidence,
        reasoning: this.generateReasoning(score, completeness, accuracy, errors, confidence)
      };

      console.log(`📊 Response analysis completed in ${Date.now() - startTime}ms:`, {
        score: `${score}%`,
        completeness: `${completeness}%`,
        accuracy: `${accuracy}%`,
        errors: errors.length,
        improvements: improvements.length
      });

      return analysis;
    } catch (error) {
      console.error("❌ Error analyzing response:", error);

      // Fallback analysis
      return {
        score: 50,
        completeness: 50,
        accuracy: 50,
        errorCount: 1,
        errors: [
          {
            type: "logic",
            severity: "medium",
            description: "Could not analyze response quality due to processing error",
            suggestion: "Please try again or simplify the request"
          }
        ],
        improvements: [],
        confidence: 30,
        reasoning: "Analysis failed - using fallback quality assessment"
      };
    }
  }

  /**
   * Analizza la completezza della risposta
   */
  private async analyzeCompleteness(
    responseString: string,
    originalRequest: string,
    currentElements: Readonly<any[]> = []
  ): Promise<number> {
    const requirements = this.extractRequirements(originalRequest);

    if (requirements.length === 0) {
      return 85; // Default if no clear requirements
    }

    let fulfilledRequirements = 0;

    for (const requirement of requirements) {
      const parsedReq = this.parseRequirementString(requirement);
      let requirementFulfilledByElement = false;

      for (const element of currentElements) {
        let typeMatch = !parsedReq.typeKeywords.length; // True if no type specified in req
        if (parsedReq.typeKeywords.length > 0) {
          const elType = (element.type || "").toLowerCase();
          if (parsedReq.typeKeywords.some(kw => elType.includes(kw))) {
            typeMatch = true;
          }
        }

        let colorMatch = !parsedReq.colorKeywords.length;
        if (parsedReq.colorKeywords.length > 0 && element.color) {
          const elColorHex = this.normalizeColorToHex(element.color);
          if (elColorHex && parsedReq.colorKeywords.some(reqHex => reqHex === elColorHex)) {
            colorMatch = true;
          }
        }

        let dimensionMatch = !parsedReq.dimensionKeywords.length;
        if (parsedReq.dimensionKeywords.length > 0) {
          let currentDimMatches = 0;
          for (const reqDim of parsedReq.dimensionKeywords) {
            const elDimValue = element[reqDim.dimension];
            if (typeof elDimValue === "number") {
              if (reqDim.valueInMm !== undefined) {
                // Compare using normalized mm value if available
                let elDimInMm = elDimValue; // Assume element dimension is already in mm by default
                const elementUnit = element[`${reqDim.dimension}Unit`] || element["unit"]; // Check for specific dimUnit or general element unit

                if (elementUnit && elementUnit.toLowerCase() !== "mm") {
                  const factor = this.getUnitToMmFactor(elementUnit);
                  if (factor) {
                    elDimInMm = elDimValue * factor;
                  } else {
                    console.warn(
                      `Element ${element.id || "unknown"} has dimension "${reqDim.dimension}" with unconvertible unit "${elementUnit}". Comparing raw values.`
                    );
                    // Fallback to comparing raw values if element unit conversion fails
                    if (reqDim.unit === undefined || reqDim.unit === "mm") {
                      // Only compare if req was in mm or unitless (assumed mm)
                      if (Math.abs(elDimValue - reqDim.value) < 1e-3) currentDimMatches++;
                      continue; // Skip mm comparison for this reqDim
                    } else {
                      // Cannot reliably compare if req had a specific non-mm unit and element unit is unconvertible
                      continue;
                    }
                  }
                }

                if (Math.abs(elDimInMm - reqDim.valueInMm) < 0.1) {
                  // Tolerance of 0.1mm
                  currentDimMatches++;
                }
              } else if (Math.abs(elDimValue - reqDim.value) < 1e-3) {
                // Fallback to raw value comparison if reqDim had no unit
                currentDimMatches++;
              }
            }
          }
          if (currentDimMatches === parsedReq.dimensionKeywords.length) {
            dimensionMatch = true;
          }
        }

        if (typeMatch && colorMatch && dimensionMatch) {
          requirementFulfilledByElement = true;
          break;
        }
      }

      if (requirementFulfilledByElement) {
        fulfilledRequirements++;
      } else {
        const reqLower = requirement.toLowerCase(); // Keep for fallback
        const responseWords = responseString.toLowerCase().split(/\\s+/);
        const foundInResponseString = responseWords.some(
          word => word.includes(reqLower) || this.isSemanticMatch(word, reqLower)
        );
        if (foundInResponseString) {
          console.warn(
            `Requirement "${requirement}" (parsed: ${JSON.stringify(parsedReq)}) mentioned in AI response but not matched in current CAD elements.`
          );
        }
      }
    }

    const completeness = Math.round((fulfilledRequirements / requirements.length) * 100);
    const detailBonus = this.calculateDetailBonus(responseString, currentElements);
    return Math.min(100, completeness + detailBonus);
  }

  /**
   * Parses a requirement string into structured data.
   * Example: "red cube width 50" -> { typeKeywords: ["cube"], colorKeywords: ["red"], dimensionKeywords: [{dimension: "width", value: 50}] }
   */
  private parseRequirementString(requirement: string): {
    typeKeywords: string[];
    colorKeywords: string[]; // Will store canonical color forms (e.g., hex)
    parsedColors: Array<{ original: string; hex?: string; keyword?: string }>; // Store details for richer matching
    dimensionKeywords: Array<{ dimension: string; value: number; unit?: string; valueInMm?: number }>;
  } {
    const lcReq = requirement.toLowerCase();
    const result = {
      typeKeywords: [] as string[],
      colorKeywords: [] as string[], // For direct hex matching primarily
      parsedColors: [] as Array<{ original: string; hex?: string; keyword?: string }>,
      dimensionKeywords: [] as Array<{
        dimension: string;
        value: number;
        unit?: string;
        valueInMm?: number;
      }>
    };

    // Known types and their synonyms
    const typeSynonyms: Record<string, string[]> = {
      cube: ["cube", "box", "cuboid", "rectangular solid", "block", "square block", "solid block"],
      sphere: ["sphere", "ball", "orb", "globe", "spherical"],
      cylinder: ["cylinder", "tube", "pipe", "rod", "shaft", "pin", "cylindrical shape", "round bar"],
      cone: ["cone", "conical", "tapered cylinder"],
      torus: ["torus", "ring", "donut", "o-ring", "toroidal"],
      pyramid: ["pyramid", "pyramidal"],
      plane: ["plane", "surface", "face", "sheet", "panel", "flat surface", "planar"],
      bracket: ["bracket", "mount", "support", "holder", "fixture", "angle bracket", "mounting plate"],
      gear: ["gear", "cog", "cogwheel", "sprocket", "pinion"],
      plate: ["plate", "sheet metal", "flat piece", "metal sheet", "base plate"],
      beam: ["beam", "girder", "bar", "strut", "column", "joist", "structural beam"],
      bolt: ["bolt", "screw", "fastener", "threaded fastener", "hex bolt", "cap screw"],
      nut: ["nut", "hex nut", "fastening nut"],
      washer: ["washer", "flat washer", "lock washer"],
      hole: ["hole", "opening", "cutout", "aperture", "cavity", "slot", "bore", "perforation", "drill hole"],
      channel: ["channel", "u-profile", "c-channel", "structural channel"],
      angle: ["angle", "l-profile", "angle iron", "l-beam"],
      flange: ["flange", "collar", "rim"],
      rib: ["rib", "stiffener", "gusset", "support rib"],
      boss: ["boss", "protrusion", "stud", "raised feature"],
      fillet: ["fillet", "rounded edge", "radius edge", "curve", "blend"],
      chamfer: ["chamfer", "beveled edge", "angled cut", "bevel"],
      sketch: ["sketch", "2d sketch", "profile", "outline", "contour"],
      extrusion: ["extrusion", "extruded shape", "linear sweep"],
      revolution: ["revolution", "revolved shape", "lathe shape", "rotational sweep"],
      loft: ["loft", "lofted shape", "blended shape"],
      sweep: ["sweep", "swept shape", "path sweep"],
      thread: ["thread", "threaded hole", "threaded rod", "screw thread"],
      spring: ["spring", "coil spring", "helical spring"],
      pipe: ["pipe", "piping", "conduit", "tube segment"], // Can overlap with cylinder but often implies hollow
      housing: ["housing", "enclosure", "case", "casing"],
      bearing: ["bearing", "ball bearing", "roller bearing"],
      shaft: ["shaft", "axle", "spindle", "rod"], // overlaps with cylinder
      keyway: ["keyway", "key slot"],
      spline: ["spline", "splined shaft", "splined hole"],
      handle: ["handle", "knob", "grip", "lever"],
      lens: ["lens", "optic", "optical element"],
      mirror: ["mirror"],
      pcb: ["pcb", "printed circuit board", "circuit board"],
      heatsink: ["heatsink", "heat sink", "cooler"],
      // Generic terms
      component: ["component", "assembly part", "sub-assembly"],
      assembly: ["assembly", "assemblage", "product structure"],
      part: ["part", "individual part", "manufactured part"],
      feature: ["feature", "geometric feature", "design feature"]
    };

    for (const type in typeSynonyms) {
      if (typeSynonyms[type].some(syn => lcReq.includes(syn))) {
        result.typeKeywords.push(type);
      }
    }
    result.typeKeywords = [...Array.from(new Set(result.typeKeywords))];

    // --- Color Parsing ---
    const colorNameToHex: Record<string, string> = {
      red: "#FF0000",
      blue: "#0000FF",
      green: "#008000",
      yellow: "#FFFF00",
      black: "#000000",
      white: "#FFFFFF",
      grey: "#808080",
      gray: "#808080",
      purple: "#800080",
      orange: "#FFA500",
      brown: "#A52A2A",
      pink: "#FFC0CB",
      cyan: "#00FFFF",
      magenta: "#FF00FF",
      lightblue: "#ADD8E6",
      darkblue: "#00008B",
      lightgreen: "#90EE90",
      darkgreen: "#006400",
      lightgrey: "#D3D3D3",
      darkgrey: "#A9A9A9"
      // Add more common colors
    };

    // Regex for hex colors (e.g., #FFF, #006400)
    const hexPattern = /#(?:[0-9a-fA-F]{3}){1,2}\b/g;
    let hexMatch;
    while ((hexMatch = hexPattern.exec(lcReq)) !== null) {
      const hex = hexMatch[0].toUpperCase();
      result.parsedColors.push({
        original: hexMatch[0],
        hex: hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex
      });
      result.colorKeywords.push(hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex); // Add hex to keywords for direct match
    }

    // Regex for rgb colors (e.g., rgb(255,0,0), rgba(0,255,0,0.5))
    const rgbPattern = /rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(?:,\s*[01]?\.?\d+\s*)?\)/gi;
    let rgbMatch;
    while ((rgbMatch = rgbPattern.exec(lcReq)) !== null) {
      const rgbStr = rgbMatch[0];
      const parts = rgbStr.match(/\d+/g);
      if (parts && parts.length >= 3) {
        const r = parseInt(parts[0], 10);
        const g = parseInt(parts[1], 10);
        const b = parseInt(parts[2], 10);
        const hex =
          `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`.toUpperCase();
        result.parsedColors.push({ original: rgbStr, hex });
        result.colorKeywords.push(hex);
      }
    }

    for (const name in colorNameToHex) {
      if (lcReq.includes(name)) {
        // Avoid adding if a more specific hex/rgb of this color was already parsed
        if (!result.parsedColors.some(pc => pc.hex === colorNameToHex[name].toUpperCase())) {
          result.parsedColors.push({ original: name, keyword: name, hex: colorNameToHex[name].toUpperCase() });
          result.colorKeywords.push(colorNameToHex[name].toUpperCase());
        }
      }
    }
    result.colorKeywords = [...Array.from(new Set(result.colorKeywords))];
    result.parsedColors = [
      ...Array.from(new Map(result.parsedColors.map(item => [item.hex || item.original, item])).values())
    ]; // Deduplicate parsedColors by hex or original

    // --- Dimension Parsing with Unit Conversion ---
    const dimPattern =
      /(width|height|depth|length|radius|diameter|size|thickness|x|y|z|distance|offset|position)[\s:=]+(-?\d+\.?\d*)\s*(mm|cm|m|in|ft|inches|millimeter|centimeter|meter|feet)?/gi;
    const defaultUnit = "mm"; // Assume mm if not specified

    const unitsToMm: Record<string, number> = {
      mm: 1,
      millimeter: 1,
      cm: 10,
      centimeter: 10,
      m: 1000,
      meter: 1000,
      in: 25.4,
      inch: 25.4,
      inches: 25.4,
      ft: 304.8,
      feet: 304.8
    };

    let dimMatch;
    while ((dimMatch = dimPattern.exec(lcReq)) !== null) {
      const dimName = dimMatch[1].toLowerCase();
      const value = parseFloat(dimMatch[2]);
      const unit = dimMatch[3] ? dimMatch[3].toLowerCase() : defaultUnit;
      let valueInMm: number | undefined = undefined;

      if (unitsToMm[unit]) {
        valueInMm = value * unitsToMm[unit];
      } else {
        // If unit is unknown but value is provided, store it without conversion
        console.warn(`Unknown unit "${unit}" for dimension "${dimName}". Storing value as is.`);
      }

      result.dimensionKeywords.push({
        dimension: dimName,
        value: value,
        unit: unit,
        valueInMm: valueInMm
      });
    }

    if (result.typeKeywords.length === 0) {
      if (/element|component|part|object|body|solid|geometry|shape|form|structure/i.test(lcReq)) {
        // Indicates a general CAD object
      }
    }

    if (result.typeKeywords.length === 0) {
      for (const type in typeSynonyms) {
        if (typeSynonyms[type].some(syn => lcReq.includes(syn))) {
          if (!result.typeKeywords.includes(type)) result.typeKeywords.push(type);
        }
      }
    }
    result.typeKeywords = [...Array.from(new Set(result.typeKeywords))];

    return result;
  }

  /**
   * Analizza l'accuratezza tecnica
   */
  private async analyzeAccuracy(response: string, context: CADContext): Promise<number> {
    let accuracy = 80; // Base accuracy

    // Verifica validità parametri CAD
    const cadParameters = this.extractCADParameters(response);
    const validParameters = cadParameters.filter(param => this.isValidCADParameter(param));

    if (cadParameters.length > 0) {
      const parameterAccuracy = (validParameters.length / cadParameters.length) * 100;
      accuracy = (accuracy + parameterAccuracy) / 2;
    }

    // Verifica coerenza geometrica
    const geometryCoherence = this.checkGeometryCoherence(response, context.elements || []);
    accuracy = (accuracy + geometryCoherence) / 2;

    // Verifica compatibilità con contesto esistente
    if (context.elements && context.elements.length > 0) {
      const contextCompatibility = this.checkContextCompatibility(response, context);
      accuracy = (accuracy + contextCompatibility) / 2;
    }

    return Math.round(accuracy);
  }

  /**
   * Trova errori nella risposta
   */
  private async findErrors(response: string, context: CADContext): Promise<ErrorReport[]> {
    const errors: ErrorReport[] = [];

    // Errori sintattici
    errors.push(...this.findSyntaxErrors(response));

    // Errori logici
    errors.push(...this.findLogicErrors(response));

    // Errori di consistenza
    errors.push(...this.findConsistencyErrors(response, context));

    // Elementi mancanti
    errors.push(...this.findMissingElements(response, context.userPreferences?.request || "", context.elements || []));

    return errors;
  }

  /**
   * Genera suggerimenti per miglioramenti
   */
  private async generateSuggestions(
    response: string,
    analysis: Partial<QualityAnalysis>,
    originalRequest: string
  ): Promise<Suggestion[]> {
    const suggestions: Suggestion[] = [];

    // Suggerimenti basati su completezza
    if ((analysis.completeness || 0) < 80) {
      suggestions.push({
        type: "add",
        priority: "high",
        description: "Add missing elements to fulfill all user requirements based on the original request.",
        expectedImprovement: 15,
        effort: "moderate",
        actionDetails: {
          elementsToAdd: [
            {
              description: `The previous response seems incomplete. Please generate the remaining CAD elements to fully address the original request: "${originalRequest}". Focus on what was missed from this initial request.`
            }
          ]
        }
      });
    }

    // Suggerimenti basati su accuratezza
    if ((analysis.accuracy || 0) < 75) {
      const errorDescriptions = (analysis.errors || []).map(e => e.description).join("; ");
      suggestions.push({
        type: "modify",
        priority: "high",
        description: "Correct technical parameters and improve geometric accuracy, addressing identified errors.",
        expectedImprovement: 20,
        effort: "moderate",
        actionDetails: {
          elementsToModify: this.generateModificationTargets(response, analysis.errors || []),
          refinementPrompt: `The previous response has accuracy issues. Please review and correct the CAD elements. Specific errors noted: ${errorDescriptions || "General inaccuracies found"}. Original request: "${originalRequest}". Response to correct: "${response}"`
        }
      });
    }

    // Suggerimenti basati su errori
    if ((analysis.errors || []).length > 0) {
      const criticalErrors = analysis.errors!.filter(e => e.severity === "critical");
      if (criticalErrors.length > 0) {
        const criticalErrorDescriptions = criticalErrors.map(e => e.description).join("; ");
        suggestions.push({
          type: "modify",
          priority: "high",
          description: "Fix critical errors that prevent proper functionality.",
          expectedImprovement: 25,
          effort: "significant",
          actionDetails: {
            elementsToModify: this.generateModificationTargets(response, criticalErrors),
            refinementPrompt: `The previous response contains critical errors: ${criticalErrorDescriptions}. Please correct these errors. Original request: "${originalRequest}". Response with errors: "${response}"`
          }
        });
      }
    }

    // Suggerimenti per ottimizzazione (refinement)
    if ((analysis.score || 0) > 70 && (analysis.score || 0) < 90) {
      suggestions.push({
        type: "refine",
        priority: "medium",
        description: "Optimize parameters and add quality-of-life improvements.",
        expectedImprovement: 10,
        effort: "minimal",
        actionDetails: {
          refinementPrompt: `The previous response is good but could be refined. Consider optimizing parameters or adding further details to enhance quality, based on the original request: "${originalRequest}". Current response for refinement: "${response}"`
        }
      });
    }

    // Suggerimenti per rimozione di elementi problematici
    const elementsToRemove = this.identifyProblematicElements(response, analysis.errors || []);
    if (elementsToRemove.length > 0) {
      suggestions.push({
        type: "remove",
        priority: "medium",
        description: "Remove problematic elements that cause conflicts or errors.",
        expectedImprovement: 15,
        effort: "minimal",
        actionDetails: {
          elementsToRemove
        }
      });
    }

    return suggestions;
  }

  /**
   * Calcola score complessivo pesato
   */
  private calculateOverallScore(
    completeness: number,
    accuracy: number,
    errorCount: number,
    confidence: number
  ): number {
    // Pesi per diverse componenti
    const weights = {
      completeness: 0.35,
      accuracy: 0.35,
      errorPenalty: 0.15,
      confidence: 0.15
    };

    // Penalità per errori (non lineare)
    const errorPenalty = Math.min(errorCount * 5, 30);
    const errorScore = Math.max(0, 100 - errorPenalty);

    const weightedScore =
      completeness * weights.completeness +
      accuracy * weights.accuracy +
      errorScore * weights.errorPenalty +
      confidence * weights.confidence;

    return Math.round(Math.max(0, Math.min(100, weightedScore)));
  }

  /**
   * Calcola confidence score
   */
  private calculateConfidence(response: string, originalRequest: string): Promise<number> {
    // Fattori che influenzano confidence
    let confidence = 70; // Base confidence

    // Lunghezza e dettaglio
    if (response.length > 200) confidence += 10;
    if (response.length > 500) confidence += 5;

    // Presenza di parametri specifici
    const hasSpecificParams = /\d+/.test(response); // Contiene numeri
    if (hasSpecificParams) confidence += 10;

    // Struttura e organizzazione
    const hasStructure = response.includes("\n") || response.includes("-") || response.includes("*");
    if (hasStructure) confidence += 5;

    // Keywords tecniche CAD
    const cadKeywords = ["element", "dimension", "parameter", "coordinate", "geometry"];
    const cadKeywordCount = cadKeywords.filter(keyword => response.toLowerCase().includes(keyword)).length;
    confidence += cadKeywordCount * 3;

    return Promise.resolve(Math.min(100, confidence));
  }

  // =======================================================================================
  // Metodi helper privati
  // =======================================================================================

  private extractRequirements(request: string): string[] {
    // Estrai requirement keywords chiave
    const patterns = [
      /create?(?:\s+\w+)*\s+(\w+)/gi,
      /generate?(?:\s+\w+)*\s+(\w+)/gi,
      /add?(?:\s+\w+)*\s+(\w+)/gi,
      /make?(?:\s+\w+)*\s+(\w+)/gi,
      /with\s+(\w+)/gi,
      /having\s+(\w+)/gi
    ];

    const requirements: string[] = [];

    patterns.forEach(pattern => {
      const matches = Array.from(request.matchAll(pattern));
      for (const match of matches) {
        if (match && match[1] && match[1].length > 2) {
          requirements.push(match[1]);
        }
      }
    });

    return [...Array.from(new Set(requirements))]; // Remove duplicates
  }

  private isSemanticMatch(word: string, requirement: string): boolean {
    // Simplified semantic matching
    const synonyms: Record<string, string[]> = {
      cube: ["box", "rectangular", "cuboid", "block"],
      sphere: ["ball", "round", "circular", "globe"],
      cylinder: ["tube", "pipe", "cylindrical", "rod", "shaft", "pin"],
      bracket: ["mount", "support", "holder", "fixture"],
      gear: ["cog", "wheel", "sprocket", "cogwheel"],
      hole: ["opening", "cutout", "aperture", "cavity", "slot", "bore"]
      // Add more synonyms as identified
    };

    const reqSynonyms = synonyms[requirement.toLowerCase()] || [];
    return reqSynonyms.includes(word.toLowerCase());
  }

  private calculateDetailBonus(responseString: string, currentElements: Readonly<any[]> = []): number {
    let bonus = 0;

    // Bonus for presence of numeric parameters in elements or response string
    const hasNumericParamsInElements = currentElements.some(el =>
      Object.values(el).some(val => typeof val === "number" && val > 0)
    );
    if (hasNumericParamsInElements || /\d+\.?\d*/.test(responseString)) bonus += 5;

    // Bonus for material specification in elements or response string
    const hasMaterialInElements = currentElements.some(el => el.material && el.material !== "unknown");
    if (hasMaterialInElements || /material|steel|aluminum|plastic|wood/i.test(responseString)) bonus += 3;

    // Bonus for dimension keywords in response string (element dimensions are implicitly checked by parameter analysis)
    if (/width|height|depth|radius|diameter|length/i.test(responseString)) bonus += 3; // Reduced bonus as elements are primary

    // Bonus for technical considerations in response string
    if (/tolerance|precision|accuracy|quality|constraint|align|assembly/i.test(responseString)) bonus += 4;

    return Math.min(15, bonus); // Max 15% bonus
  }

  private extractCADParameters(
    responseString: string,
    currentElements: Readonly<any[]> = []
  ): Array<{ type: string; value: number; unit?: string }> {
    const parameters: Array<{ type: string; value: number; unit?: string }> = [];

    // Pattern per parametri dimensionali
    const dimensionPattern = /(width|height|depth|radius|diameter|length)[\s:=]+(\d+\.?\d*)\s*(mm|cm|m|in|ft)?/gi;

    let match;
    while ((match = dimensionPattern.exec(responseString)) !== null) {
      parameters.push({
        type: match[1].toLowerCase(),
        value: parseFloat(match[2]),
        unit: match[3] || "mm"
      });
    }

    return parameters;
  }

  private isValidCADParameter(param: { type: string; value: number; unit?: string }): boolean {
    // Validazione base per parametri CAD
    if (param.value <= 0 && param.type !== "x" && param.type !== "y" && param.type !== "z") return false; // Allow zero for coordinates

    // Controlli specifici per tipo
    switch (param.type) {
      case "radius":
      case "diameter":
        return param.value > 0 && param.value < 10000; // Reasonable limits
      case "width":
      case "height":
      case "depth":
      case "length":
        return param.value > 0 && param.value < 50000; // Reasonable limits
      default:
        return true;
    }
  }

  private checkGeometryCoherence(responseString: string, currentElements: Readonly<any[]> = []): number {
    // Simplified geometry coherence check, could be enhanced by analyzing currentElements relations
    let coherence = 85; // Default coherence score

    // Check for impossible geometry combinations in the textual response
    const hasRadius = /radius/i.test(responseString);
    const hasRectangularKeywords = /width.*height|rectangular|cube/i.test(responseString);

    if (hasRadius && hasRectangularKeywords) {
      // This might be okay (e.g. a cube with filleted edges), but flags for attention
      coherence -= 5;
    }

    // Advanced geometric analysis of currentElements
    if (currentElements.length > 0) {
      const geometricIssues = this.analyzeGeometricIssues(currentElements);

      // Apply penalties based on detected issues
      coherence -= geometricIssues.overlapPenalty;
      coherence -= geometricIssues.zFightingPenalty;
      coherence -= geometricIssues.invalidCoordinatesPenalty;
      coherence -= geometricIssues.scaleInconsistencyPenalty;

      // Apply bonuses for good practices
      coherence += geometricIssues.spatialOrganizationBonus;
      coherence += geometricIssues.consistencyBonus;
    }

    return Math.max(0, Math.min(100, coherence));
  }

  /**
   * Analyzes geometric issues in CAD elements collection
   */
  private analyzeGeometricIssues(elements: Readonly<any[]>): {
    overlapPenalty: number;
    zFightingPenalty: number;
    invalidCoordinatesPenalty: number;
    scaleInconsistencyPenalty: number;
    spatialOrganizationBonus: number;
    consistencyBonus: number;
    detectedIssues: Array<{
      type: "overlap" | "z_fighting" | "invalid_coordinates" | "scale_inconsistency" | "spatial_chaos";
      severity: "low" | "medium" | "high";
      elements: string[];
      description: string;
    }>;
  } {
    const result = {
      overlapPenalty: 0,
      zFightingPenalty: 0,
      invalidCoordinatesPenalty: 0,
      scaleInconsistencyPenalty: 0,
      spatialOrganizationBonus: 0,
      consistencyBonus: 0,
      detectedIssues: [] as Array<{
        type: "overlap" | "z_fighting" | "invalid_coordinates" | "scale_inconsistency" | "spatial_chaos";
        severity: "low" | "medium" | "high";
        elements: string[];
        description: string;
      }>
    };

    if (elements.length === 0) return result;

    // 1. Check for overlapping elements (approximate check for simple geometries)
    const overlaps = this.detectElementOverlaps(elements);
    if (overlaps.length > 0) {
      result.overlapPenalty = Math.min(20, overlaps.length * 5);
      result.detectedIssues.push({
        type: "overlap",
        severity: overlaps.length > 2 ? "high" : "medium",
        elements: overlaps.map(o => `${o.element1Id} & ${o.element2Id}`),
        description: `Detected ${overlaps.length} potential element overlap(s)`
      });
    }

    // 2. Check for z-fighting (elements at nearly same z-level)
    const zFightingPairs = this.detectZFighting(elements);
    if (zFightingPairs.length > 0) {
      result.zFightingPenalty = Math.min(15, zFightingPairs.length * 3);
      result.detectedIssues.push({
        type: "z_fighting",
        severity: zFightingPairs.length > 3 ? "high" : "medium",
        elements: zFightingPairs.map(p => `${p.element1Id} & ${p.element2Id}`),
        description: `Detected ${zFightingPairs.length} potential z-fighting issue(s)`
      });
    }

    // 3. Check for invalid coordinates
    const invalidCoordElements = this.detectInvalidCoordinates(elements);
    if (invalidCoordElements.length > 0) {
      result.invalidCoordinatesPenalty = Math.min(25, invalidCoordElements.length * 8);
      result.detectedIssues.push({
        type: "invalid_coordinates",
        severity: "high",
        elements: invalidCoordElements.map(el => el.id || "unknown"),
        description: `Found ${invalidCoordElements.length} element(s) with invalid coordinates`
      });
    }

    // 4. Check for scale inconsistencies
    const scaleIssues = this.detectScaleInconsistencies(elements);
    if (scaleIssues.extremeVariation) {
      result.scaleInconsistencyPenalty = 10;
      result.detectedIssues.push({
        type: "scale_inconsistency",
        severity: "medium",
        elements: scaleIssues.problematicElements,
        description: `Extreme scale variation detected (ratio: ${scaleIssues.sizeRatio}:1)`
      });
    }

    // 5. Bonuses for good spatial organization
    const spatialAnalysis = this.analyzeSpatialOrganization(elements);
    if (spatialAnalysis.wellOrganized) {
      result.spatialOrganizationBonus = 5;
    }
    if (spatialAnalysis.consistentSpacing) {
      result.consistencyBonus = 3;
    }

    return result;
  }

  /**
   * Detects potential overlaps between elements (simplified geometric check)
   */
  private detectElementOverlaps(elements: Readonly<any[]>): Array<{
    element1Id: string;
    element2Id: string;
    overlapSeverity: number;
  }> {
    const overlaps: Array<{
      element1Id: string;
      element2Id: string;
      overlapSeverity: number;
    }> = [];

    for (let i = 0; i < elements.length; i++) {
      for (let j = i + 1; j < elements.length; j++) {
        const el1 = elements[i];
        const el2 = elements[j];

        if (!this.hasValidBounds(el1) || !this.hasValidBounds(el2)) continue;

        const overlap = this.calculateSimpleOverlap(el1, el2);
        if (overlap.isOverlapping) {
          overlaps.push({
            element1Id: el1.id || `element_${i}`,
            element2Id: el2.id || `element_${j}`,
            overlapSeverity: overlap.severity
          });
        }
      }
    }

    return overlaps;
  }

  /**
   * Detects z-fighting between elements
   */
  private detectZFighting(elements: Readonly<any[]>): Array<{
    element1Id: string;
    element2Id: string;
    zDifference: number;
  }> {
    const zFightingPairs: Array<{
      element1Id: string;
      element2Id: string;
      zDifference: number;
    }> = [];

    const zFightingThreshold = 0.01; // 0.01mm threshold for z-fighting

    for (let i = 0; i < elements.length; i++) {
      for (let j = i + 1; j < elements.length; j++) {
        const el1 = elements[i];
        const el2 = elements[j];

        const z1 = this.getElementZ(el1);
        const z2 = this.getElementZ(el2);

        if (z1 !== undefined && z2 !== undefined) {
          const zDiff = Math.abs(z1 - z2);
          if (zDiff < zFightingThreshold && zDiff > 0) {
            zFightingPairs.push({
              element1Id: el1.id || `element_${i}`,
              element2Id: el2.id || `element_${j}`,
              zDifference: zDiff
            });
          }
        }
      }
    }

    return zFightingPairs;
  }

  /**
   * Detects elements with invalid coordinates
   */
  private detectInvalidCoordinates(elements: Readonly<any[]>): any[] {
    return elements.filter(el => {
      const x = this.getElementX(el);
      const y = this.getElementY(el);
      const z = this.getElementZ(el);

      // Check for NaN, Infinity, or extremely large values
      const isInvalidCoord = (coord: number | undefined) => {
        if (coord === undefined || coord === null) return false; // Allow undefined/null
        return isNaN(coord) || !isFinite(coord) || Math.abs(coord) > 1000000; // 1M unit limit
      };

      return isInvalidCoord(x) || isInvalidCoord(y) || isInvalidCoord(z);
    });
  }

  /**
   * Detects scale inconsistencies between elements
   */
  private detectScaleInconsistencies(elements: Readonly<any[]>): {
    extremeVariation: boolean;
    sizeRatio: number;
    problematicElements: string[];
  } {
    const sizes = elements.map(el => this.calculateElementSize(el)).filter(size => size > 0);

    if (sizes.length < 2) {
      return { extremeVariation: false, sizeRatio: 1, problematicElements: [] };
    }

    const minSize = Math.min(...sizes);
    const maxSize = Math.max(...sizes);
    const sizeRatio = maxSize / minSize;

    // Consider extreme if ratio > 1000:1 (e.g., 1mm vs 1m elements)
    const extremeVariation = sizeRatio > 1000;

    const problematicElements: string[] = [];
    if (extremeVariation) {
      const threshold = Math.sqrt(minSize * maxSize); // Geometric mean as threshold
      elements.forEach((el, i) => {
        const size = this.calculateElementSize(el);
        if (size < threshold / 10 || size > threshold * 10) {
          problematicElements.push(el.id || `element_${i}`);
        }
      });
    }

    return {
      extremeVariation,
      sizeRatio: Math.round(sizeRatio),
      problematicElements
    };
  }

  /**
   * Analyzes spatial organization of elements
   */
  private analyzeSpatialOrganization(elements: Readonly<any[]>): {
    wellOrganized: boolean;
    consistentSpacing: boolean;
    gridLike: boolean;
  } {
    if (elements.length < 3) {
      return { wellOrganized: true, consistentSpacing: true, gridLike: false }; // Small collections are considered organized
    }

    // Check for grid-like arrangement
    const positions = elements.map(el => ({
      x: this.getElementX(el) || 0,
      y: this.getElementY(el) || 0,
      z: this.getElementZ(el) || 0
    }));

    // Calculate distances between elements
    const distances: number[] = [];
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const dx = positions[i].x - positions[j].x;
        const dy = positions[i].y - positions[j].y;
        const dz = positions[i].z - positions[j].z;
        distances.push(Math.sqrt(dx * dx + dy * dy + dz * dz));
      }
    }

    // Check for consistent spacing (coefficient of variation < 0.5)
    const meanDistance = distances.reduce((sum, d) => sum + d, 0) / distances.length;
    const variance = distances.reduce((sum, d) => sum + Math.pow(d - meanDistance, 2), 0) / distances.length;
    const stdDev = Math.sqrt(variance);
    const coefficientOfVariation = stdDev / meanDistance;

    const consistentSpacing = coefficientOfVariation < 0.5;

    // Check for reasonable distribution (not all clustered in one spot)
    const boundingBox = this.calculateBoundingBox(positions);
    const diagonal = Math.sqrt(
      Math.pow(boundingBox.maxX - boundingBox.minX, 2) +
        Math.pow(boundingBox.maxY - boundingBox.minY, 2) +
        Math.pow(boundingBox.maxZ - boundingBox.minZ, 2)
    );

    const wellOrganized = diagonal > meanDistance * 0.5; // Elements spread out reasonably

    return {
      wellOrganized,
      consistentSpacing,
      gridLike: consistentSpacing && wellOrganized
    };
  }

  // Helper methods for geometric analysis
  private hasValidBounds(element: any): boolean {
    const x = this.getElementX(element);
    const y = this.getElementY(element);
    const z = this.getElementZ(element);

    return x !== undefined && y !== undefined && z !== undefined && isFinite(x) && isFinite(y) && isFinite(z);
  }

  private calculateSimpleOverlap(el1: any, el2: any): { isOverlapping: boolean; severity: number } {
    // Simplified overlap check for basic shapes
    const center1 = { x: this.getElementX(el1) || 0, y: this.getElementY(el1) || 0, z: this.getElementZ(el1) || 0 };
    const center2 = { x: this.getElementX(el2) || 0, y: this.getElementY(el2) || 0, z: this.getElementZ(el2) || 0 };

    const size1 = this.calculateElementSize(el1);
    const size2 = this.calculateElementSize(el2);

    const distance = Math.sqrt(
      Math.pow(center1.x - center2.x, 2) + Math.pow(center1.y - center2.y, 2) + Math.pow(center1.z - center2.z, 2)
    );

    const combinedRadius = (size1 + size2) / 4; // Rough approximation
    const isOverlapping = distance < combinedRadius;

    const severity = isOverlapping ? Math.max(0, 1 - distance / combinedRadius) : 0;

    return { isOverlapping, severity };
  }

  private getElementX(element: any): number | undefined {
    return element.x ?? element.position?.x ?? element.center?.x;
  }

  private getElementY(element: any): number | undefined {
    return element.y ?? element.position?.y ?? element.center?.y;
  }

  private getElementZ(element: any): number | undefined {
    return element.z ?? element.position?.z ?? element.center?.z;
  }

  private calculateElementSize(element: any): number {
    // Calculate approximate size based on dimensions
    const width = element.width || element.radius * 2 || element.diameter || 1;
    const height = element.height || element.radius * 2 || element.diameter || 1;
    const depth = element.depth || element.length || element.radius * 2 || element.diameter || 1;

    // Return geometric mean of dimensions as representative size
    return Math.pow(width * height * depth, 1 / 3);
  }

  private calculateBoundingBox(positions: Array<{ x: number; y: number; z: number }>): {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
  } {
    if (positions.length === 0) {
      return { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 };
    }

    const result = {
      minX: positions[0].x,
      maxX: positions[0].x,
      minY: positions[0].y,
      maxY: positions[0].y,
      minZ: positions[0].z,
      maxZ: positions[0].z
    };

    positions.forEach(pos => {
      result.minX = Math.min(result.minX, pos.x);
      result.maxX = Math.max(result.maxX, pos.x);
      result.minY = Math.min(result.minY, pos.y);
      result.maxY = Math.max(result.maxY, pos.y);
      result.minZ = Math.min(result.minZ, pos.z);
      result.maxZ = Math.max(result.maxZ, pos.z);
    });

    return result;
  }

  private checkContextCompatibility(responseString: string, context: CADContext): number {
    // This method already uses context.elements implicitly through the CADContext type
    let compatibility = 80;

    if (context.elements && context.elements.length > 0) {
      // Check if response string acknowledges or refers to existing elements
      const mentionsExisting = /existing|current|present|already|add to|modify the|remove the/i.test(responseString);
      if (mentionsExisting) compatibility += 10;

      // Advanced check: if the responseString correctly identifies elements that are actually in context.elements
      const contextElementAnalysis = this.analyzeContextElementReferences(responseString, context.elements);

      // Award compatibility points based on accuracy of element references
      if (contextElementAnalysis.accurateReferences > 0) {
        compatibility += contextElementAnalysis.accurateReferences * 5; // 5 points per accurate reference
      }

      // Penalize for inaccurate references (hallucinated elements)
      if (contextElementAnalysis.inaccurateReferences > 0) {
        compatibility -= contextElementAnalysis.inaccurateReferences * 3; // -3 points per inaccurate reference
      }

      // Bonus for comprehensive understanding
      if (contextElementAnalysis.comprehensiveUnderstanding) {
        compatibility += 15;
      }

      // Additional checks for modification scenarios
      if (this.isModificationScenario(responseString)) {
        const modificationCompatibility = this.assessModificationCompatibility(responseString, context.elements);
        compatibility = (compatibility + modificationCompatibility) / 2; // Average the scores
      }
    }

    return Math.min(100, compatibility);
  }

  /**
   * Analyzes how well the response string references actual elements in the context
   */
  private analyzeContextElementReferences(
    responseString: string,
    contextElements: any[]
  ): {
    accurateReferences: number;
    inaccurateReferences: number;
    comprehensiveUnderstanding: boolean;
    details: {
      foundElements: Array<{ elementId: string; confidence: number; matchType: string }>;
      hallucinations: Array<{ mentionedElement: string; reason: string }>;
    };
  } {
    const result = {
      accurateReferences: 0,
      inaccurateReferences: 0,
      comprehensiveUnderstanding: false,
      details: {
        foundElements: [] as Array<{ elementId: string; confidence: number; matchType: string }>,
        hallucinations: [] as Array<{ mentionedElement: string; reason: string }>
      }
    };

    if (!contextElements || contextElements.length === 0) {
      return result;
    }

    // Create searchable element data
    const elementMap = new Map<string, any>();
    contextElements.forEach(el => {
      if (el.id) elementMap.set(el.id.toLowerCase(), el);
      if (el.name) elementMap.set(el.name.toLowerCase(), el);
    });

    // Pattern for element references in response
    const elementReferencePatterns = [
      // Direct ID references
      /element[s]?\s+(?:with\s+)?(?:id[s]?\s+)?['"]*([a-zA-Z0-9\-_]+)['"]*(?:\s|$|,|\.)/gi,
      // Named references
      /(?:the\s+)?([a-zA-Z][a-zA-Z0-9\s]{2,15})(?:\s+(?:element|component|part|object))/gi,
      // Type-based references with context
      /(cube|sphere|cylinder|cone|torus|pyramid|plane|bracket|gear|plate|beam|bolt|nut|washer|hole)(?:\s+(?:element|component|part|object|at|with|having))/gi
    ];

    // Find all potential element references
    const potentialReferences = new Set<string>();
    elementReferencePatterns.forEach(pattern => {
      const responseStringLower = responseString.toLowerCase();
      let match;
      while ((match = pattern.exec(responseStringLower)) !== null) {
        if (match[1] && match[1].length > 1) {
          potentialReferences.add(match[1].trim());
        }
      }
    });

    // Analyze each potential reference
    potentialReferences.forEach(ref => {
      const refLower = ref.toLowerCase();
      let found = false;
      let confidence = 0;
      let matchType = "";

      // Check direct ID match
      if (elementMap.has(refLower)) {
        found = true;
        confidence = 0.95;
        matchType = "direct_id";
        result.details.foundElements.push({
          elementId: elementMap.get(refLower).id || refLower,
          confidence,
          matchType
        });
        result.accurateReferences++;
        return;
      }

      // Check name match
      for (const element of Array.from(elementMap.values())) {
        if (element.name && element.name.toLowerCase().includes(refLower)) {
          found = true;
          confidence = 0.8;
          matchType = "name_match";
          result.details.foundElements.push({
            elementId: element.id || element.name,
            confidence,
            matchType
          });
          result.accurateReferences++;
          return;
        }
      }

      // Check type match
      for (const element of Array.from(elementMap.values())) {
        if (element.type && element.type.toLowerCase().includes(refLower)) {
          found = true;
          confidence = 0.6;
          matchType = "type_match";
          result.details.foundElements.push({
            elementId: element.id || element.type,
            confidence,
            matchType
          });
          result.accurateReferences++;
          return;
        }
      }

      // No match found - potential hallucination
      if (!found) {
        result.inaccurateReferences++;
        result.details.hallucinations.push({
          mentionedElement: ref,
          reason: "Element referenced but not found in context"
        });
      }
    });

    // Check for comprehensive understanding
    const mentionedElementCount = result.accurateReferences;
    const contextElementCount = contextElements.length;

    // Comprehensive if mentions at least 70% of existing elements or shows clear awareness
    const comprehensiveThreshold = Math.max(1, Math.ceil(contextElementCount * 0.7));
    const showsGeneralAwareness =
      /(?:all|most|several|multiple|existing|current)\s+(?:elements|components|parts|objects)/i.test(responseString);

    result.comprehensiveUnderstanding =
      mentionedElementCount >= comprehensiveThreshold || (showsGeneralAwareness && mentionedElementCount > 0);

    return result;
  }

  /**
   * Checks if the response is describing a modification scenario
   */
  private isModificationScenario(responseString: string): boolean {
    const modificationKeywords = [
      "modify",
      "change",
      "update",
      "adjust",
      "alter",
      "edit",
      "revise",
      "move",
      "rotate",
      "scale",
      "resize",
      "reposition",
      "add to",
      "remove from",
      "delete",
      "replace"
    ];

    return modificationKeywords.some(keyword => responseString.toLowerCase().includes(keyword));
  }

  /**
   * Assesses compatibility for modification scenarios
   */
  private assessModificationCompatibility(responseString: string, contextElements: any[]): number {
    let modCompatibility = 70; // Base score for modification scenarios

    // Check if modifications are technically feasible
    const feasibilityCheck = this.checkModificationFeasibility(responseString, contextElements);
    modCompatibility = (modCompatibility + feasibilityCheck) / 2;

    // Check if modifications preserve existing constraints
    const constraintPreservation = this.checkConstraintPreservation(responseString, contextElements);
    modCompatibility = (modCompatibility + constraintPreservation) / 2;

    // Check for modification clarity and specificity
    const clarityScore = this.assessModificationClarity(responseString);
    modCompatibility = (modCompatibility + clarityScore) / 2;

    return Math.round(modCompatibility);
  }

  /**
   * Checks if proposed modifications are technically feasible
   */
  private checkModificationFeasibility(responseString: string, contextElements: any[]): number {
    let feasibility = 80;

    // Check for impossible geometric modifications
    if (/impossible|cannot|invalid/i.test(responseString)) {
      feasibility -= 30;
    }

    // Check for reasonable dimensional changes
    const dimensionChanges = responseString.match(/(?:width|height|depth|radius|diameter|length)[\s:=]+(\d+\.?\d*)/gi);
    if (dimensionChanges) {
      dimensionChanges.forEach(change => {
        const value = parseFloat(change.match(/(\d+\.?\d*)/)?.[1] || "0");
        if (value <= 0 || value > 10000) {
          // Unreasonable values
          feasibility -= 10;
        }
      });
    }

    return Math.max(0, feasibility);
  }

  /**
   * Checks if modifications preserve important constraints
   */
  private checkConstraintPreservation(responseString: string, contextElements: any[]): number {
    let preservation = 85;

    // Check if response considers relationships between elements
    const mentionsRelationships = /(?:relative|distance|gap|clearance|alignment|constraint)/i.test(responseString);
    if (mentionsRelationships) {
      preservation += 10;
    }

    // Check if response maintains material consistency
    const mentionsMaterials = /material|steel|aluminum|plastic|wood/i.test(responseString);
    if (mentionsMaterials && contextElements.some(el => el.material)) {
      preservation += 5;
    }

    return Math.min(100, preservation);
  }

  /**
   * Assesses clarity and specificity of modification instructions
   */
  private assessModificationClarity(responseString: string): number {
    let clarity = 75;

    // Check for specific target identification
    const hasSpecificTargets = /(?:element|component|part)(?:\s+(?:with\s+)?(?:id|named|called))/i.test(responseString);
    if (hasSpecificTargets) clarity += 15;

    // Check for clear action verbs
    const hasActionVerbs = /(?:move|rotate|scale|resize|change|set|adjust)/i.test(responseString);
    if (hasActionVerbs) clarity += 10;

    // Check for specific values
    const hasSpecificValues = /\d+\.?\d*\s*(?:mm|cm|m|degrees|%)/i.test(responseString);
    if (hasSpecificValues) clarity += 10;

    return Math.min(100, clarity);
  }

  private findSyntaxErrors(responseString: string): ErrorReport[] {
    const errors: ErrorReport[] = [];

    // Check for incomplete JSON-like structures
    const openBraces = (responseString.match(/{/g) || []).length;
    const closeBraces = (responseString.match(/}/g) || []).length;

    if (openBraces !== closeBraces) {
      errors.push({
        type: "syntax",
        severity: "medium",
        description: "Unmatched braces in response structure",
        suggestion: "Ensure all opening braces have corresponding closing braces"
      });
    }

    return errors;
  }

  private findLogicErrors(responseString: string): ErrorReport[] {
    const errors: ErrorReport[] = [];

    // Check for contradictory statements
    if (responseString.includes("impossible") || responseString.includes("cannot")) {
      errors.push({
        type: "logic",
        severity: "high",
        description: "Response contains contradictory or impossible statements",
        suggestion: "Review and resolve logical inconsistencies"
      });
    }

    return errors;
  }

  private findConsistencyErrors(responseString: string, context: CADContext): ErrorReport[] {
    const errors: ErrorReport[] = [];

    // Check for inconsistent units
    const units = responseString.match(/\d+\s*(mm|cm|m|in|ft)/gi) || [];
    const uniqueUnits = [...Array.from(new Set(units.map(u => u.match(/[a-z]+/i)?.[0]?.toLowerCase())))];

    if (uniqueUnits.length > 1) {
      errors.push({
        type: "consistency",
        severity: "medium",
        description: "Mixed units detected in response",
        suggestion: "Use consistent units throughout the design"
      });
    }

    return errors;
  }

  private findMissingElements(
    responseString: string,
    originalRequest: string,
    currentElements: Readonly<any[]> = []
  ): ErrorReport[] {
    const errors: ErrorReport[] = [];

    // If requirements were extracted and overall completeness (based on elements) is low,
    // this suggests missing elements.
    const requirements = this.extractRequirements(originalRequest);
    if (requirements.length > 0) {
      let fulfilledCount = 0;
      for (const req of requirements) {
        const reqLower = req.toLowerCase();
        if (
          currentElements.some(
            el => (el.name || "").toLowerCase().includes(reqLower) || (el.type || "").toLowerCase().includes(reqLower)
          )
        ) {
          fulfilledCount++;
        }
      }
      if (currentElements.length > 0 && fulfilledCount < requirements.length * 0.5) {
        // Example threshold: less than 50% of requirements met by elements
        errors.push({
          type: "missing",
          severity: "high",
          description: "Significant parts of the original request appear to be missing from the current CAD elements.",
          suggestion: "Review the original request and add the missing components or details."
        });
      }
    }

    // Check for very brief textual responses if no elements were generated or the description is about generating them
    if (currentElements.length === 0 && responseString.length < 50) {
      errors.push({
        type: "missing",
        severity: "high",
        description: "Response too brief, likely missing important details for element generation.",
        suggestion: "Provide more detailed specifications and parameters."
      });
    }

    return errors;
  }

  private generateReasoning(
    score: number,
    completeness: number,
    accuracy: number,
    errors: ErrorReport[],
    confidence: number
  ): string {
    let reasoning = "";

    if (score >= this.qualityThresholds.excellent) {
      reasoning = "Excellent response with high completeness and accuracy.";
    } else if (score >= this.qualityThresholds.good) {
      reasoning = "Good response that meets most requirements.";
    } else if (score >= this.qualityThresholds.acceptable) {
      reasoning = "Acceptable response but has room for improvement.";
    } else {
      reasoning = "Response needs significant improvement.";
    }

    if (errors.length > 0) {
      reasoning += ` Contains ${errors.length} error(s) that should be addressed.`;
    }

    if (completeness < 70) {
      reasoning += " Missing some key requirements from the original request.";
    }

    if (accuracy < 70) {
      reasoning += " Technical accuracy could be improved.";
    }

    return reasoning;
  }

  // Helper to get unit conversion factor to mm
  private getUnitToMmFactor(unit?: string): number | undefined {
    if (!unit) return undefined;
    const lcUnit = unit.toLowerCase();
    const unitsToMm: Record<string, number> = {
      mm: 1,
      millimeter: 1,
      cm: 10,
      centimeter: 10,
      m: 1000,
      meter: 1000,
      in: 25.4,
      inch: 25.4,
      inches: 25.4,
      ft: 304.8,
      feet: 304.8
    };
    return unitsToMm[lcUnit];
  }

  // Helper to normalize various color inputs to a standard hex format
  private normalizeColorToHex(colorInput: string | { r: number; g: number; b: number } | any): string | undefined {
    if (typeof colorInput === "string") {
      const lcColor = colorInput.toLowerCase();
      const colorNameToHex: Record<string, string> = {
        red: "#FF0000",
        blue: "#0000FF",
        green: "#008000",
        yellow: "#FFFF00",
        black: "#000000",
        white: "#FFFFFF",
        grey: "#808080",
        gray: "#808080",
        purple: "#800080",
        orange: "#FFA500",
        brown: "#A52A2A",
        pink: "#FFC0CB",
        cyan: "#00FFFF",
        magenta: "#FF00FF",
        lightblue: "#ADD8E6",
        darkblue: "#00008B",
        lightgreen: "#90EE90",
        darkgreen: "#006400",
        lightgrey: "#D3D3D3",
        darkgrey: "#A9A9A9"
      };
      if (colorNameToHex[lcColor]) return colorNameToHex[lcColor].toUpperCase();
      if (/^#(?:[0-9a-fA-F]{3}){1,2}$/.test(lcColor)) {
        return lcColor.length === 4
          ? `#${lcColor[1]}${lcColor[1]}${lcColor[2]}${lcColor[2]}${lcColor[3]}${lcColor[3]}`.toUpperCase()
          : lcColor.toUpperCase();
      }
      const rgbMatch = lcColor.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*[01]?\.?\d+\s*)?\)/i);
      if (rgbMatch && rgbMatch.length >= 4) {
        const r = parseInt(rgbMatch[1], 10);
        const g = parseInt(rgbMatch[2], 10);
        const b = parseInt(rgbMatch[3], 10);
        if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
          return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`.toUpperCase();
        }
      }
    } else if (
      typeof colorInput === "object" &&
      colorInput !== null &&
      "r" in colorInput &&
      "g" in colorInput &&
      "b" in colorInput
    ) {
      const { r, g, b } = colorInput as { r: number; g: number; b: number };
      if (
        typeof r === "number" &&
        typeof g === "number" &&
        typeof b === "number" &&
        r >= 0 &&
        r <= 255 &&
        g >= 0 &&
        g <= 255 &&
        b >= 0 &&
        b <= 255
      ) {
        return `#${Math.round(r).toString(16).padStart(2, "0")}${Math.round(g).toString(16).padStart(2, "0")}${Math.round(b).toString(16).padStart(2, "0")}`.toUpperCase();
      }
    }
    return undefined; // Cannot normalize
  }

  /**
   * Genera target di modifica basati sugli errori
   */
  private generateModificationTargets(
    response: string,
    errors: ErrorReport[]
  ): Array<{
    targetElementId: string;
    modificationDescription?: string;
    properties?: Record<string, any>;
  }> {
    const modifications: Array<{
      targetElementId: string;
      modificationDescription?: string;
      properties?: Record<string, any>;
    }> = [];

    // Analizza errori per identificare specifici elementi da modificare
    for (let i = 0; i < errors.length; i++) {
      const error = errors[i];
      const elementId = `element_${i + 1}`; // Genera ID generici per ora

      if (error.type === "consistency" && error.description.includes("Mixed units")) {
        modifications.push({
          targetElementId: elementId,
          modificationDescription: "Standardize all dimensions to use consistent units (preferably mm)",
          properties: { unitStandard: "mm" }
        });
      }

      if (error.type === "syntax" && error.description.includes("braces")) {
        modifications.push({
          targetElementId: elementId,
          modificationDescription: "Fix malformed data structures and ensure proper JSON format",
          properties: { format: "valid_json" }
        });
      }

      if (error.type === "logic" && error.description.includes("impossible")) {
        modifications.push({
          targetElementId: elementId,
          modificationDescription: "Resolve logical inconsistencies in geometric parameters",
          properties: { validation: "geometric_consistency" }
        });
      }

      if (error.type === "missing") {
        modifications.push({
          targetElementId: elementId,
          modificationDescription: "Add missing required properties and complete element definitions",
          properties: { completeness: "required_fields" }
        });
      }
    }

    // Se non ci sono modifiche specifiche, aggiungi una generica
    if (modifications.length === 0 && errors.length > 0) {
      modifications.push({
        targetElementId: "general_fix",
        modificationDescription: `Address the following issues: ${errors.map(e => e.description).join("; ")}`,
        properties: { generalFix: true }
      });
    }

    return modifications;
  }

  /**
   * Identifica elementi problematici da rimuovere
   */
  private identifyProblematicElements(
    response: string,
    errors: ErrorReport[]
  ): Array<{
    targetElementId: string;
    reason?: string;
  }> {
    const elementsToRemove: Array<{
      targetElementId: string;
      reason?: string;
    }> = [];

    // Cerca pattern di elementi problematici nel response
    const duplicatePattern = /duplicate|duplicated|repeated/i;
    const invalidPattern = /invalid|malformed|corrupted/i;
    const conflictPattern = /conflict|overlapping|interfering/i;

    for (let i = 0; i < errors.length; i++) {
      const error = errors[i];
      const elementId = `problematic_element_${i + 1}`;

      if (duplicatePattern.test(error.description)) {
        elementsToRemove.push({
          targetElementId: elementId,
          reason: "Remove duplicate element that causes redundancy"
        });
      }

      if (invalidPattern.test(error.description)) {
        elementsToRemove.push({
          targetElementId: elementId,
          reason: "Remove invalid element with malformed properties"
        });
      }

      if (conflictPattern.test(error.description)) {
        elementsToRemove.push({
          targetElementId: elementId,
          reason: "Remove conflicting element that interferes with others"
        });
      }
    }

    return elementsToRemove;
  }
}

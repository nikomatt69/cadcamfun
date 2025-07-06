// Text to CAD Stream Service - Servizio per la generazione progressiva di elementi CAD
import { Element } from "@/src/store/elementsStore";
import {
  CADStreamChunk,
  TextToCADStreamSettings,
  ThinkingStep,
  StreamEvent,
  StreamEventType
} from "@/src/types/AITypes";

export interface TextToCADStreamOptions {
  description: string;
  constraints?: any;
  context?: string[];
  settings: TextToCADStreamSettings;
  onProgress?: (chunk: CADStreamChunk) => void;
  onThinking?: (step: ThinkingStep) => void;
  onElement?: (element: Element) => void;
  onComplete?: (elements: Element[]) => void;
  onError?: (error: Error) => void;
  systemPrompt?: string;
}

export class TextToCADStreamService {
  private abortController: AbortController | null = null;
  private isStreaming: boolean = false;
  private generatedElements: Element[] = [];
  private currentProgress: number = 0;

  async streamTextToCAD(options: TextToCADStreamOptions): Promise<void> {
    if (this.isStreaming) {
      throw new Error("Stream already in progress");
    }

    this.isStreaming = true;
    this.abortController = new AbortController();
    this.generatedElements = [];
    this.currentProgress = 0;

    try {
      // Prepare the stream request
      const streamRequest = {
        model: "claude-sonnet-4-20250514",
        messages: [
          {
            role: "user",
            content: this.buildCADPrompt(options.description, options.constraints, options.context)
          }
        ],
        max_tokens: 8000,
        temperature: 0.7,
        reasoningEnabled: true, // Enable thinking for progressive analysis
        system: options.systemPrompt || this.buildSystemPrompt(options.settings)
      };

      // Start the stream
      const response = await fetch("/api/ai/anthropic-stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(streamRequest),
        signal: this.abortController.signal
      });

      if (!response.ok) {
        throw new Error(`Stream failed: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error("Response body is null");
      }

      // Process the stream
      await this.processStream(response.body, options);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        console.log("Stream aborted by user");
        return;
      }

      console.error("Text to CAD Stream error:", error);
      options.onError?.(error as Error);
    } finally {
      this.isStreaming = false;
      this.abortController = null;
    }
  }

  private async processStream(body: ReadableStream<Uint8Array>, options: TextToCADStreamOptions): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              await this.handleStreamEvent(data, options);
            } catch (parseError) {
              console.warn("Failed to parse stream data:", parseError);
            }
          } else if (line.startsWith("event: ")) {
            // Event type is handled with the data
            continue;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private async handleStreamEvent(eventData: any, options: TextToCADStreamOptions): Promise<void> {
    if (eventData.chunk) {
      // Handle thinking steps
      if (eventData.chunk.type === "thinking" || eventData.chunk.content?.includes("thinking")) {
        const thinkingStep: ThinkingStep = {
          id: `think-${Date.now()}`,
          type: "analysis",
          content: eventData.chunk.content || eventData.chunk,
          confidence: 0.8,
          timestamp: new Date(),
          duration: 0,
          reasoning: "Analyzing CAD requirements...",
          relatedConcepts: []
        };

        options.onThinking?.(thinkingStep);

        // Create thinking chunk
        const thinkingChunk: CADStreamChunk = {
          id: `chunk-thinking-${Date.now()}`,
          type: "thinking",
          content: thinkingStep,
          progress: this.currentProgress,
          timestamp: new Date()
        };

        options.onProgress?.(thinkingChunk);
      }

      // Handle text content that might contain CAD instructions
      else if (typeof eventData.chunk === "string") {
        await this.parseCADInstructions(eventData.chunk, options);
      }
    }
  }

  private async parseCADInstructions(text: string, options: TextToCADStreamOptions): Promise<void> {
    // Look for CAD element patterns in the text
    const elementPatterns = [
      /create\s+(\w+)\s+at\s+\(([^)]+)\)/gi,
      /draw\s+(\w+)\s+from\s+\(([^)]+)\)\s+to\s+\(([^)]+)\)/gi,
      /add\s+(\w+)\s+with\s+(\w+):\s*([^,\n]+)/gi
    ];

    for (const pattern of elementPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        await this.generateElementFromMatch(match, options);
      }
    }

    // Check if we have complete JSON objects for elements
    const jsonMatches = text.match(/\{[^{}]*"type"[^{}]*\}/g);
    if (jsonMatches) {
      for (const jsonMatch of jsonMatches) {
        try {
          const elementData = JSON.parse(jsonMatch);
          await this.createElementFromData(elementData, options);
        } catch (e) {
          // Ignore malformed JSON
        }
      }
    }
  }

  private async generateElementFromMatch(match: RegExpExecArray, options: TextToCADStreamOptions): Promise<void> {
    const elementType = match[1]?.toLowerCase();
    const coords = match[2];

    if (!elementType || !coords) return;

    const element: Element = {
      id: `stream-element-${Date.now()}-${Math.random()}`,
      type: this.mapElementType(elementType),
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      rotation: {
        x: 0,
        y: 0,
        z: 0
      },
      layerId: "default",
      properties: {
        coordinates: coords,
        generatedAt: new Date(),
        streamGenerated: true
      },
      style: {
        stroke: "#0066cc",
        strokeWidth: 2,
        fill: "transparent"
      }
    };

    // Parse coordinates if possible
    this.parseCoordinates(coords, element);

    await this.addElement(element, options);
  }

  private async createElementFromData(elementData: any, options: TextToCADStreamOptions): Promise<void> {
    const element: Element = {
      id: `stream-data-${Date.now()}-${Math.random()}`,
      type: elementData.type || "rectangle",
      x: elementData.x || 0,
      y: elementData.y || 0,
      width: elementData.width || 100,
      height: elementData.height || 100,
      rotation: {
        x: elementData.rotation?.x || 0,
        y: elementData.rotation?.y || 0,
        z: elementData.rotation?.z || 0
      },
      layerId: elementData.layerId || "default",
      properties: {
        ...elementData.properties,
        generatedAt: new Date(),
        streamGenerated: true
      },
      style: elementData.style || {
        stroke: "#0066cc",
        strokeWidth: 2,
        fill: "transparent"
      }
    };

    await this.addElement(element, options);
  }

  private async addElement(element: Element, options: TextToCADStreamOptions): Promise<void> {
    this.generatedElements.push(element);
    this.currentProgress = Math.min(95, this.currentProgress + 10);

    // Progressive delay for streaming effect
    if (options.settings.streamDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, options.settings.streamDelay));
    }

    // Create element chunk
    const elementChunk: CADStreamChunk = {
      id: `chunk-element-${Date.now()}`,
      type: "element",
      content: element,
      progress: this.currentProgress,
      timestamp: new Date(),
      metadata: {
        elementType: element.type,
        confidence: 0.9,
        totalElements: this.generatedElements.length + 3, // Estimate
        currentElement: this.generatedElements.length
      }
    };

    options.onProgress?.(elementChunk);
    options.onElement?.(element);

    // Validation if enabled
    if (options.settings.qualityCheck) {
      await this.validateElement(element, options);
    }
  }

  private async validateElement(element: Element, options: TextToCADStreamOptions): Promise<void> {
    // Simple validation
    const isValid = element.width > 0 && element.height > 0 && element.type;

    const validationChunk: CADStreamChunk = {
      id: `chunk-validation-${Date.now()}`,
      type: "validation",
      content: {
        elementId: element.id,
        isValid,
        issues: isValid ? [] : ["Invalid dimensions or type"]
      },
      progress: this.currentProgress,
      timestamp: new Date()
    };

    options.onProgress?.(validationChunk);
  }

  private mapElementType(type: string): string {
    const typeMap: Record<string, string> = {
      "line": "line",
      "circle": "circle",
      "rectangle": "rectangle",
      "rect": "rectangle",
      "square": "rectangle",
      "polygon": "polygon",
      "ellipse": "ellipse",
      "arc": "arc",
      "curve": "curve",
      "path": "path"
    };

    return typeMap[type] || "rectangle";
  }

  private parseCoordinates(coords: string, element: Element): void {
    try {
      const coordPairs = coords.split(",").map(c => parseFloat(c.trim()));
      if (coordPairs.length >= 2) {
        element.x = coordPairs[0] || 0;
        element.y = coordPairs[1] || 0;
      }
      if (coordPairs.length >= 4) {
        element.width = Math.abs(coordPairs[2] - coordPairs[0]) || 100;
        element.height = Math.abs(coordPairs[3] - coordPairs[1]) || 100;
      }
    } catch (e) {
      // Use defaults if parsing fails
    }
  }

  private buildCADPrompt(description: string, constraints?: any, context?: string[]): string {
    return `
You are a CAD generation AI. Generate CAD elements progressively based on this description:

"${description}"

${constraints ? `Constraints: ${JSON.stringify(constraints)}` : ""}
${context ? `Context: ${context.join(", ")}` : ""}

Generate CAD elements step by step, explaining your reasoning for each element.
Output elements in this format for each:
{
  "type": "rectangle|circle|line|polygon|ellipse|arc",
  "x": number,
  "y": number, 
  "width": number,
  "height": number,
  "properties": { /* additional properties */ }
}

Think through the design systematically, considering:
1. Overall layout and structure
2. Individual component placement
3. Dimensional relationships
4. Manufacturing constraints
5. Design optimization

Be progressive - generate one element at a time with full reasoning.
`;
  }

  private buildSystemPrompt(settings: TextToCADStreamSettings): string {
    return `
You are an expert CAD generation system with progressive streaming capabilities.

Settings:
- Progressive Generation: ${settings.progressiveGeneration}
- Batch Size: ${settings.batchSize}
- Quality Check: ${settings.qualityCheck}
- Auto Validation: ${settings.autoValidation}

Generate CAD elements methodically and progressively.
Think through each step before generating elements.
Explain your reasoning for each design decision.
Output valid CAD element data in JSON format.
`;
  }

  public abort(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
    this.isStreaming = false;
  }

  public isActive(): boolean {
    return this.isStreaming;
  }

  public getProgress(): number {
    return this.currentProgress;
  }

  public getGeneratedElements(): Element[] {
    return [...this.generatedElements];
  }
}

// Singleton instance
export const textToCADStreamService = new TextToCADStreamService();

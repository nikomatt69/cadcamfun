// src/lib/cadAIService.ts

import axios from 'axios';

// Define types for specific CAD/CAM AI requests
export type ComponentType = 
  | 'mechanical' 
  | 'electronic' 
  | 'structural' 
  | 'fixture' 
  | 'enclosure' 
  | 'fastener';

export type ManufacturingMethod = 
  | '3d-printing'
  | 'cnc-machining'
  | 'injection-molding'
  | 'laser-cutting'
  | 'sheet-metal'
  | 'extrusion';

export type MaterialCategory =
  | 'metal'
  | 'plastic'
  | 'composite'
  | 'wood'
  | 'ceramic';

// Interface for component generation request
export interface ComponentGenerationRequest {
  description: string;
  type?: ComponentType;
  manufacturingMethod?: ManufacturingMethod;
  material?: MaterialCategory;
  dimensions?: {
    maxWidth?: number;
    maxHeight?: number;
    maxDepth?: number;
    minWallThickness?: number;
  };
  constraints?: string[];
  purpose?: string;
}

// Interface for component analysis request
export interface ComponentAnalysisRequest {
  elements: any[];
  analysisType: 'manufacturability' | 'structural' | 'cost' | 'optimization';
}

// Interface for AI response with confidence level
export interface AIResponse<T> {
  data: T;
  confidenceScore?: number;
  processingTime?: number;
  warnings?: string[];
  suggestions?: string[];
}

/**
 * Specialized AI service for CAD/CAM applications
 */
class CADaiService {
  private apiKey: string | undefined;
  private apiUrl: string;
  private defaultModel: string;
  
  // Specialized prompt templates for different CAD tasks
  private PROMPTS = {
    COMPONENT_GENERATION: `You are a CAD component design expert. Create a detailed, manufacturable component based on the following description. 
    Ensure all dimensions are realistic, connections are properly designed, and the component follows 
    industry best practices. Consider material properties, manufacturing methods, and structural integrity.
    Output ONLY a valid JSON array of CAD elements that form the component.`,
    
    MANUFACTURING_ANALYSIS: `You are a manufacturing expert. Analyze this CAD design for manufacturability.
    Consider wall thickness, draft angles, tool access, and manufacturing constraints for the specified 
    process. Provide detailed feedback on potential issues and suggest improvements.`,
    
    STRUCTURAL_ANALYSIS: `You are a structural engineering expert. Analyze this CAD design for structural 
    integrity. Consider load paths, stress concentrations, material properties, and potential failure 
    modes. Identify weak points and suggest reinforcements or design changes.`,
    
    DESIGN_OPTIMIZATION: `You are a CAD optimization expert. Analyze this design for opportunities to 
    improve performance, reduce material usage, simplify manufacturing, or enhance functionality while 
    maintaining the original design intent. Suggest specific modifications with clear rationale.`
  };

  constructor() {
    this.apiKey = process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
    this.apiUrl = 'https://api.anthropic.com/v1/messages';
    this.defaultModel = 'claude-3-7-sonnet-20250219';
    
    // Check if we're in browser environment and handle accordingly
    if (typeof window !== 'undefined' && !this.apiKey) {
      console.warn('No API key found for CAD AI Service. Set NEXT_PUBLIC_ANTHROPIC_API_KEY environment variable.');
    }
  }

  /**
   * Set API key manually (if not using environment variables)
   */
  setApiKey(key: string) {
    this.apiKey = key;
  }

  /**
   * Set the model to use for AI requests
   */
  setModel(model: string) {
    this.defaultModel = model;
  }

  /**
   * Generate a CAD component based on description and parameters
   */
  async generateComponent(request: ComponentGenerationRequest): Promise<AIResponse<any[]>> {
    try {
      // Build specialized prompt with manufacturing considerations
      let prompt = this.PROMPTS.COMPONENT_GENERATION + '\n\n';
      
      prompt += `COMPONENT DESCRIPTION: ${request.description}\n\n`;
      
      if (request.type) {
        prompt += `COMPONENT TYPE: ${request.type}\n`;
      }
      
      if (request.manufacturingMethod) {
        prompt += `MANUFACTURING METHOD: ${request.manufacturingMethod}\n`;
        
        // Add specific constraints based on manufacturing method
        switch (request.manufacturingMethod) {
          case '3d-printing':
            prompt += 'CONSTRAINTS: Consider minimum printable feature size, support structures, orientation, and layer lines.\n';
            break;
          case 'cnc-machining':
            prompt += 'CONSTRAINTS: Consider tool access, inside corner radii, fixture points, and machining directions.\n';
            break;
          case 'injection-molding':
            prompt += 'CONSTRAINTS: Consider draft angles, constant wall thickness, proper radii, and ejector pin locations.\n';
            break;
          case 'sheet-metal':
            prompt += 'CONSTRAINTS: Consider bend radii, k-factor, minimum flange sizes, and assembly considerations.\n';
            break;
        }
      }
      
      if (request.material) {
        prompt += `MATERIAL CATEGORY: ${request.material}\n`;
        
        // Add specific material considerations
        switch (request.material) {
          case 'metal':
            prompt += 'MATERIAL CONSIDERATIONS: Consider thermal properties, structural requirements, and proper fillet sizes.\n';
            break;
          case 'plastic':
            prompt += 'MATERIAL CONSIDERATIONS: Consider shrinkage, wall thickness transitions, and proper radii.\n';
            break;
          case 'composite':
            prompt += 'MATERIAL CONSIDERATIONS: Consider fiber orientation, laminate thickness, and proper joints.\n';
            break;
        }
      }
      
      if (request.dimensions) {
        prompt += 'DIMENSIONS CONSTRAINTS:\n';
        if (request.dimensions.maxWidth) prompt += `- Maximum width: ${request.dimensions.maxWidth}mm\n`;
        if (request.dimensions.maxHeight) prompt += `- Maximum height: ${request.dimensions.maxHeight}mm\n`;
        if (request.dimensions.maxDepth) prompt += `- Maximum depth: ${request.dimensions.maxDepth}mm\n`;
        if (request.dimensions.minWallThickness) prompt += `- Minimum wall thickness: ${request.dimensions.minWallThickness}mm\n`;
      }
      
      if (request.constraints && request.constraints.length) {
        prompt += 'ADDITIONAL CONSTRAINTS:\n';
        request.constraints.forEach(constraint => {
          prompt += `- ${constraint}\n`;
        });
      }
      
      if (request.purpose) {
        prompt += `PURPOSE: ${request.purpose}\n`;
      }
      
      prompt += '\nGenerate a complete, valid JSON array with multiple elements that make up this component. Each element must include type, position (x,y,z), dimensions, and color. Format your response ONLY as valid JSON without any explanations or markdown.';
      
      // Make the API request
      const response = await this.makeAIRequest(prompt);
      
      // Parse the JSON from the response
      let elements: any[] = [];
      let warnings: string[] = [];
      
      try {
        // Try parsing the direct response first
        elements = JSON.parse(response);
      } catch (parseError) {
        // If direct parsing fails, try to extract JSON from markdown code blocks
        const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/);
        if (jsonMatch && jsonMatch[1]) {
          elements = JSON.parse(jsonMatch[1]);
        } else {
          // If that fails too, look for any array-like structure
          const arrayMatch = response.match(/\[\s*\{[\s\S]*\}\s*\]/);
          if (arrayMatch) {
            elements = JSON.parse(arrayMatch[0]);
          } else {
            warnings.push('Failed to parse structured output. Response may not be valid JSON.');
            elements = [];
          }
        }
      }
      
      // Apply some validation and enhancement to ensure consistent output
      const validatedElements = elements.map(element => {
        // Ensure element has required properties
        return {
          type: element.type || 'cube',
          x: element.x ?? 0,
          y: element.y ?? 0,
          z: element.z ?? 0,
          width: element.width ?? 50,
          height: element.height ?? 50,
          depth: element.depth ?? 50,
          radius: element.radius ?? 25,
          color: element.color ?? '#1e88e5',
          ...(element.rotation && { 
            rotation: {
              x: element.rotation.x ?? 0,
              y: element.rotation.y ?? 0,
              z: element.rotation.z ?? 0
            }
          })
        };
      });
      
      return {
        data: validatedElements,
        confidenceScore: 0.85, // Placeholder - in a real implementation this would come from the API
        processingTime: 1.2, // Placeholder in seconds
        warnings,
        suggestions: [
          'Consider adding fillets to sharp corners for better structural integrity',
          'Check wall thickness for consistent manufacturability'
        ]
      };
    } catch (error) {
      console.error('CAD AI Component Generation Error:', error);
      throw new Error('Failed to generate CAD component: ' + (error as Error).message);
    }
  }

  /**
   * Analyze an existing CAD design for various aspects
   */
  async analyzeComponent(request: ComponentAnalysisRequest): Promise<AIResponse<any>> {
    try {
      let prompt = '';
      const elements = request.elements;
      
      // Select the appropriate prompt template based on analysis type
      switch (request.analysisType) {
        case 'manufacturability':
          prompt = this.PROMPTS.MANUFACTURING_ANALYSIS;
          break;
        case 'structural':
          prompt = this.PROMPTS.STRUCTURAL_ANALYSIS;
          break;
        case 'optimization':
          prompt = this.PROMPTS.DESIGN_OPTIMIZATION;
          break;
        case 'cost':
          prompt = 'You are a cost estimation expert. Analyze this CAD design and provide a detailed cost breakdown for manufacturing.';
          break;
      }
      
      prompt += `\n\nCAD ELEMENTS:\n${JSON.stringify(elements, null, 2)}\n\n`;
      prompt += 'Provide a thorough analysis with specific observations and actionable recommendations. Format your response as JSON with the following structure: { "analysis": { "issues": [], "strengths": [] }, "recommendations": [], "confidenceScore": number }';
      
      const response = await this.makeAIRequest(prompt);
      
      // Parse the JSON response
      let analysisResult;
      try {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          analysisResult = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('Could not extract valid JSON from response');
        }
      } catch (error) {
        // If JSON parsing fails, create a structured response from the text
        analysisResult = {
          analysis: {
            summary: response.substring(0, 200) + '...',
            issues: [],
            strengths: []
          },
          recommendations: [],
          confidenceScore: 0.7
        };
      }
      
      return {
        data: analysisResult,
        confidenceScore: analysisResult.confidenceScore || 0.8,
        processingTime: 2.1, // Placeholder in seconds
        warnings: []
      };
    } catch (error) {
      console.error('CAD AI Analysis Error:', error);
      throw new Error('Failed to analyze CAD component: ' + (error as Error).message);
    }
  }

  /**
   * Enhance an existing design with additional features or improvements
   */
  async enhanceComponent(elements: any[], enhancementDescription: string): Promise<AIResponse<any[]>> {
    try {
      const prompt = `You are a CAD design enhancement expert. Modify and improve the following CAD design 
      based on this enhancement request: "${enhancementDescription}"
      
      Current CAD elements:
      ${JSON.stringify(elements, null, 2)}
      
      Produce an improved version that incorporates the requested changes while maintaining design integrity.
      Return ONLY the complete JSON array of the enhanced CAD elements without any explanation or markdown.`;
      
      const response = await this.makeAIRequest(prompt);
      
      // Parse the JSON from the response
      let enhancedElements: any[] = [];
      let warnings: string[] = [];
      
      try {
        // Try different parsing approaches as in generateComponent
        // Direct parsing first
        enhancedElements = JSON.parse(response);
      } catch (parseError) {
        const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/);
        if (jsonMatch && jsonMatch[1]) {
          enhancedElements = JSON.parse(jsonMatch[1]);
        } else {
          const arrayMatch = response.match(/\[\s*\{[\s\S]*\}\s*\]/);
          if (arrayMatch) {
            enhancedElements = JSON.parse(arrayMatch[0]);
          } else {
            warnings.push('Failed to parse enhancement output.');
            enhancedElements = elements; // Return original elements if parsing fails
          }
        }
      }
      
      return {
        data: enhancedElements,
        confidenceScore: 0.82,
        processingTime: 1.8,
        warnings,
        suggestions: [
          'Review the enhanced design to ensure it meets your requirements',
          'Check for any unintended modifications'
        ]
      };
    } catch (error) {
      console.error('CAD AI Enhancement Error:', error);
      throw new Error('Failed to enhance CAD component: ' + (error as Error).message);
    }
  }

  /**
   * Generate technical documentation for a CAD component
   */
  async generateDocumentation(elements: any[], documentationType: 'assembly' | 'specification' | 'bom'): Promise<string> {
    try {
      let promptPrefix = '';
      
      switch (documentationType) {
        case 'assembly':
          promptPrefix = 'Generate a step-by-step assembly instruction document for this CAD component.';
          break;
        case 'specification':
          promptPrefix = 'Create a comprehensive technical specification document for this CAD component.';
          break;
        case 'bom':
          promptPrefix = 'Generate a detailed bill of materials (BOM) for this CAD component.';
          break;
      }
      
      const prompt = `${promptPrefix}
      
      CAD Elements:
      ${JSON.stringify(elements, null, 2)}
      
      Include all relevant technical details, dimensions, materials, and manufacturing notes.
      Format the document in clear, professional language suitable for technical documentation.`;
      
      return await this.makeAIRequest(prompt);
    } catch (error) {
      console.error('CAD AI Documentation Error:', error);
      throw new Error('Failed to generate documentation: ' + (error as Error).message);
    }
  }

  /**
   * Make an API request to Claude API
   * @private
   */
  private async makeAIRequest(prompt: string): Promise<string> {
    if (!this.apiKey) {
      throw new Error('API key not configured for CAD AI Service');
    }
    
    try {
      const response = await axios.post(
        this.apiUrl,
        {
          model: this.defaultModel,
          max_tokens: 4000,
          messages: [
            { role: 'user', content: prompt }
          ]
        },
        {
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': '2025-02-19'
          }
        }
      );
      
      // Extract the text content from the response
      return response.data.content[0]?.text || '';
    } catch (error) {
      console.error('AI API request failed:', error);
      if (axios.isAxiosError(error) && error.response) {
        throw new Error(`API Error (${error.response.status}): ${error.response.data?.error?.message || 'Unknown API error'}`);
      }
      throw error;
    }
  }

  /**
   * Simplified interface for basic text generation
   * Useful for general design advice or explanations
   */
  async generateText(prompt: string): Promise<string> {
    try {
      return await this.makeAIRequest(prompt);
    } catch (error) {
      console.error('CAD AI Text Generation Error:', error);
      throw new Error('Failed to generate text: ' + (error as Error).message);
    }
  }
}

// Create and export a singleton instance
export const cadAIService = new CADaiService();

export default cadAIService;
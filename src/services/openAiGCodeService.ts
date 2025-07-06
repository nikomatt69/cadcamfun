// src/services/openAiGCodeService.ts
import axios from "axios";

/**
 * Service for OpenAI API integration specifically for GCode operations
 */
class OpenAiGCodeService {
  private apiKey = process.env.OPENAI_API_KEY!;
  private baseUrl: string = "https://api.openai.com/v1";
  private model: string = "gpt-4.1";

  /**
   * Initialize the service with optional API key
   */
  constructor(apiKey?: string) {
    if (!apiKey) {
      console.error("OpenAI API key is missing");
    }
  }

  /**
   * Set the API key for OpenAI
   */
  setApiKey(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * Set the model to use
   */
  setModel(model: string) {
    this.model = model;
  }

  /**
   * Get currently used model
   */
  getModel(): string {
    return this.model;
  }

  /**
   * Check if the service is configured with an API key
   */
  isConfigured(): boolean {
    return !!this.apiKey;
  }

  /**
   * Generate GCode from a text description
   */
  async generateGCode(
    prompt: string,
    options: {
      temperature?: number;
      machineType?: "fanuc" | "heidenhain" | "siemens" | "haas" | "generic";
      maxTokens?: number;
    } = {}
  ): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY!;
    if (!apiKey) {
      console.error("OpenAI API key is missing");
    }

    const { temperature = 0.3, machineType = "fanuc", maxTokens = 2000 } = options;

    // Create a specialized system prompt for GCode generation
    const systemPrompt = `You are an expert CNC programmer with extensive experience in creating G-code programs. 
    Generate well-formatted, efficient, and safe ${machineType.toUpperCase()} G-code based on the following description.
    Follow these guidelines:
    - Include safety features like proper tool changes, spindle control, and coolant commands
    - Use common ${machineType.toUpperCase()} G-code syntax and conventions
    - Add helpful comments to explain key operations
    - Focus on creating a complete, executable program
    - Start with a proper program header and end with a proper program end
    - Only output valid G-code, no explanations or markdown
    
    For reference:
    - Fanuc uses O#### for program numbers, N#### for line numbers, and % at program start/end
    - Heidenhain uses BEGIN PGM for program start and END PGM for program end
    - Siemens uses ; for comments
    - Use G90 for absolute coordinates, G91 for incremental
    
    Output the complete G-code program with no other text.`;

    try {
      // Make request to OpenAI API through our endpoint to avoid exposing API key in client
      const response = await axios.post("/api/openai/completion", {
        model: this.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt }
        ],
        temperature,
        max_tokens: maxTokens,
        presence_penalty: 0.1,
        frequency_penalty: 0.2
      });

      return response.data.gcode || "";
    } catch (error) {
      console.error("Error generating GCode:", error);
      throw error;
    }
  }

  /**
   * Optimize existing GCode
   */
  async optimizeGCode(
    gcode: string,
    options: {
      temperature?: number;
      optimizationType?: "speed" | "quality" | "balanced";
      machineType?: "fanuc" | "heidenhain" | "siemens" | "haas" | "generic";
      maxTokens?: number;
    } = {}
  ): Promise<{ code: string; improvements: string[]; stats: any }> {
    const apiKey = process.env.OPENAI_API_KEY!;
    if (!apiKey) {
      console.error("OpenAI API key is missing");
    }

    const { temperature = 0.2, optimizationType = "balanced", machineType = "fanuc", maxTokens = 3000 } = options;

    // Create a specialized system prompt for GCode optimization
    const systemPrompt = `You are an expert CNC programmer specializing in optimizing G-code for efficiency and quality. 
    Analyze and optimize the provided ${machineType.toUpperCase()} G-code focusing on 
    ${
      optimizationType === "speed"
        ? "maximizing execution speed, reducing cycle time, and path efficiency."
        : optimizationType === "quality"
          ? "improving surface finish, tool life, and precision."
          : "balancing execution speed and quality."
    }
    
    Implement the following optimizations:
    - Eliminate redundant commands
    - Optimize rapid movements (G0/G00)
    - Improve cutting movements (G1/G01, G2/G02, G3/G03)
    - Consolidate sequential moves in the same direction
    - ${optimizationType === "speed" ? "Optimize feed rates for faster execution" : "Adjust feed rates for better finish"}
    - Maintain safe tool paths and operations
    
    Return a JSON object with:
    1. "code": The optimized G-code as a string
    2. "improvements": Array of string descriptions of improvements made
    3. "stats": Object with:
       - "originalLines": Number of lines in original code
       - "optimizedLines": Number of lines in optimized code
       - "reductionPercent": Percentage reduction in lines
       - "estimatedTimeReduction": Estimated time saved in minutes
    
    Format the response as valid JSON only.`;

    try {
      // Make request to OpenAI API
      const response = await axios.post("/api/openai/completion", {
        model: this.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: gcode }
        ],
        temperature,
        max_tokens: maxTokens,
        response_format: { type: "json_object" }
      });

      // Parse the JSON response
      const result = response.data.json;

      if (!result || !result.code) {
        throw new Error("Invalid response format from API");
      }

      return result;
    } catch (error) {
      console.error("Error optimizing GCode:", error);
      throw error;
    }
  }

  /**
   * Analyze GCode for issues or improvements
   */
  async analyzeGCode(
    gcode: string,
    options: {
      temperature?: number;
      maxTokens?: number;
    } = {}
  ): Promise<{ summary: string; issues: Array<{ severity: string; description: string; lineNumbers: number[] }> }> {
    const apiKey = process.env.OPENAI_API_KEY!;
    if (!apiKey) {
      console.error("OpenAI API key is missing");
    }

    const { temperature = 0.2, maxTokens = 1500 } = options;

    // Create a specialized system prompt for GCode analysis
    const systemPrompt = `You are an expert CNC programmer with extensive experience in analyzing G-code.
    Analyze the provided G-code for potential issues, inefficiencies, or improvements.
    
    Return a JSON object with:
    1. "summary": A concise summary of your analysis
    2. "issues": An array of issue objects, each with:
       - "severity": "critical", "warning", or "info"
       - "description": Detailed description of the issue
       - "lineNumbers": Array of line numbers where the issue occurs
    
    Format the response as valid JSON only.`;

    try {
      // Make request to OpenAI API
      const response = await axios.post("/api/openai/completion", {
        model: this.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: gcode }
        ],
        temperature,
        max_tokens: maxTokens,
        response_format: { type: "json_object" }
      });

      // Parse the JSON response
      const result = response.data.json;

      if (!result || !result.summary) {
        throw new Error("Invalid response format from API");
      }

      return result;
    } catch (error) {
      console.error("Error analyzing GCode:", error);
      throw error;
    }
  }

  /**
   * Get explanations for specific GCode lines or commands
   */
  async explainGCode(
    gcode: string,
    options: {
      temperature?: number;
      maxTokens?: number;
    } = {}
  ): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY!;
    if (!apiKey) {
      console.error("OpenAI API key is missing");
    }

    const { temperature = 0.3, maxTokens = 1000 } = options;

    // Create a specialized system prompt for GCode explanation
    const systemPrompt = `You are an expert CNC programmer and educator specialized in explaining G-code.
    Explain the provided G-code in clear, concise language that both beginners and experienced users can understand.
    
    Your explanation should:
    - Describe the overall purpose of the code
    - Explain the key commands and their meaning
    - Identify any potential issues or concerns
    - Add context about how the commands work together
    - Be educational but practical
    
    Be thorough but avoid unnecessary jargon.`;

    try {
      // Make request to OpenAI API
      const response = await axios.post("/api/openai/completion", {
        model: this.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: gcode }
        ],
        temperature,
        max_tokens: maxTokens
      });

      return response.data.content || "";
    } catch (error) {
      console.error("Error explaining GCode:", error);
      throw error;
    }
  }

  /**
   * Get completion suggestions for GCode
   */
  async getGCodeCompletions(
    context: string,
    options: {
      temperature?: number;
      maxTokens?: number;
      limit?: number;
    } = {}
  ): Promise<Array<{ text: string; description: string }>> {
    const apiKey = process.env.OPENAI_API_KEY!;
    if (!apiKey) {
      console.error("OpenAI API key is missing");
    }

    const { temperature = 0.2, maxTokens = 500, limit = 3 } = options;

    // Create a specialized system prompt for GCode completions
    const systemPrompt = `You are an expert CNC programmer. Based on the provided G-code context, generate ${limit} helpful completion suggestions.
    Return a JSON array of suggestions, each with:
    - "text": The exact G-code to insert (maximum 40 characters per suggestion)
    - "description": Brief description of what this code does
    
    Format the response as valid JSON only.`;

    try {
      // Make request to OpenAI API
      const response = await axios.post("/api/openai/completion", {
        model: this.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: context }
        ],
        temperature,
        max_tokens: maxTokens,
        response_format: { type: "json_object" }
      });

      // Parse the JSON response
      const result = response.data.json;

      if (!Array.isArray(result)) {
        return [];
      }

      return result;
    } catch (error) {
      console.error("Error getting GCode completions:", error);
      return [];
    }
  }

  /**
   * Chat with AI about GCode
   */
  async chatCompletion(
    messages: Array<{ role: "user" | "assistant" | "system"; content: string }>,
    options: {
      temperature?: number;
      maxTokens?: number;
    } = {}
  ): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY!;
    if (!apiKey) {
      console.error("OpenAI API key is missing");
    }
    const { temperature = 0.7, maxTokens = 1500 } = options;

    // Add default system message if not provided
    if (!messages.some(msg => msg.role === "system")) {
      messages = [
        {
          role: "system",
          content:
            "You are an expert CNC programmer and machinist assistant. You provide helpful, accurate information about G-code programming, CNC machine operation, tooling, and manufacturing processes. You give concise, practical advice and can assist with programming, troubleshooting, and optimizing CNC operations."
        },
        ...messages
      ];
    }

    try {
      // Make request to OpenAI API
      const response = await axios.post("/api/openai/completion", {
        model: this.model,
        messages,
        temperature,
        max_tokens: maxTokens
      });

      return response.data.content || "";
    } catch (error) {
      console.error("Error in chat completion:", error);
      throw error;
    }
  }
}

// Export singleton instance
export const openAiGCodeService = new OpenAiGCodeService();
export default openAiGCodeService;

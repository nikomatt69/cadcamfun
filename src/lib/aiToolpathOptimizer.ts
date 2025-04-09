// src/lib/aiToolpathOptimizer.ts
import { aiService } from './aiService';
import { Toolpath, ToolpathParameters } from '../types/ai';

export class AIToolpathOptimizer {
  async optimize(
    toolpath: Toolpath, 
    parameters: ToolpathParameters
  ): Promise<Toolpath> {
    const prompt = this.constructOptimizationPrompt(toolpath, parameters);
    
    try {
      const responseText = await aiService.generateResponse(prompt);
      return this.parseOptimizedToolpath(responseText, toolpath);
    } catch (error) {
      console.error('Toolpath Optimization Error', error);
      return toolpath;
    }
  }

  private constructOptimizationPrompt(
    toolpath: Toolpath, 
    parameters: ToolpathParameters
  ): string {
    return `Ottimizzazione Percorso Utensile:

    Parametri Correnti:
    - Operazione: ${parameters.operation}
    - Utensile: ${parameters.tool.type}
    - Diametro: ${parameters.tool.diameter}mm
    - Velocità taglio: ${parameters.cutting.speed} rpm
    - Avanzamento: ${parameters.cutting.feedRate} mm/min

    Dettagli Percorso:
    ${JSON.stringify(toolpath, null, 2)}

    Obiettivi Ottimizzazione:
    1. Minimizzare tempo di lavorazione
    2. Ridurre usura utensile
    3. Migliorare qualità superficie
    4. Ottimizzare strategia di taglio
    5. Considerare vincoli macchina
    `;
  }

  private parseOptimizedToolpath(
    responseText: string, 
    originalToolpath: Toolpath
  ): Toolpath {
    // Logica base di parsing e ottimizzazione
    return {
      ...originalToolpath,
      aiOptimizations: {
        description: responseText,
        optimizationScore: 0.75,
        suggestedModifications: []
      }
    };
  }
}

export const aiToolpathOptimizer = new AIToolpathOptimizer();
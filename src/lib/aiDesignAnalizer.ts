import { aiService } from './aiService';
import { AIDesignSuggestion } from '../types/ai';
import { Element } from '../store/elementsStore';

export class AIDesignAnalyzer {
  async analyzeDesign(elements: Element[]): Promise<AIDesignSuggestion[]> {
    const prompt = this.constructAnalysisPrompt(elements);
    
    try {
      const responseText = await aiService.generateResponse(prompt);
      return this.parseDesignSuggestions(responseText);
    } catch (error) {
      console.error('Design Analysis Error', error);
      return [];
    }
  }

  private constructAnalysisPrompt(elements: Element[]): string {
    return `Analizza il seguente design CAD:
    ${JSON.stringify(elements, null, 2)}

    Fornisci suggerimenti su:
    1. Ottimizzazioni geometriche
    2. Miglioramenti di fattibilità
    3. Potenziali modifiche
    4. Valutazione prestazioni
    5. Analisi costi`;
  }

  private parseDesignSuggestions(responseText: string): AIDesignSuggestion[] {
    // Implementazione del parsing (potrebbe richiedere parsing JSON o logica specifica)
    return [{
      id: `suggestion-${Date.now()}`,
      
      type: 'optimization',
      description: responseText,
      confidence: 0.85,
      potentialImpact: {
        performanceGain: 15,
        costReduction: 10,
        manufacturabilityScore: 0.75
      },
      suggestedModifications: []
    }];
  }
}

export const aiDesignAnalyzer = new AIDesignAnalyzer();
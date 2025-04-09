// src/services/claudeService.ts
import axios from 'axios';

export async function analyzeGCode(gcode: string): Promise<{
  suggestions: Array<{
    id: string;
    title: string;
    description: string;
    originalCode: string;
    suggestedCode: string;
    type: 'optimization' | 'error' | 'improvement';
  }>;
}> {
  try {
    // Chiama la nostra API route interna
    const response = await axios.post('/api/analyze-gcode', { gcode });
    return response.data;
  } catch (error) {
    console.error('Errore nell\'analisi del G-code con Claude:', error);
    throw error;
  }
}
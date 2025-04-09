// src/lib/gCodeGenerationUtils.ts
import  { ToolpathSettings } from '../components/cam/ToolpathGenerator';

// Interfaccia per le statistiche di taglio
export interface CuttingStatistics {
  cuttingSpeed: number;      // velocità di taglio (m/min)
  chipLoad: number;          // avanzamento per dente (mm)
  materialRemovalRate: number; // tasso rimozione materiale (cm³/min)
  effectiveStepover: number;   // stepover effettivo (mm)
}

// Calcola l'avanzamento ottimale per dente in base al materiale e al diametro utensile
export function calculateOptimalChipLoad(material: string, toolDiameter: number, flutes: number): number {
  // Valori di riferimento per avanzamento per dente (mm) in base al materiale
  const chipLoadValues: {[key: string]: number} = {
    'aluminum': 0.033,
    'steel': 0.018,
    'wood': 0.076,
    'plastic': 0.038,
    'brass': 0.033,
    'titanium': 0.013,
    'composite': 0.025,
    'other': 0.020
  };

  // Modifica leggermente il valore base in base al diametro dell'utensile
  const baseChipLoad = chipLoadValues[material] || 0.02;
  
  // Aggiusta per diametro (utensili più grandi possono avere avanzamenti maggiori)
  const diameterMultiplier = Math.pow(toolDiameter / 6, 0.3); // aumento non lineare
  
  return baseChipLoad * diameterMultiplier;
}

// Calcola le statistiche di taglio complete
export function calculateCuttingStatistics(settings: ToolpathSettings): CuttingStatistics {
  const { toolDiameter, flutes, feedrate, rpm, stepover } = settings;
  
  // Calcola avanzamento per dente (chip load)
  const chipLoad = feedrate / (rpm * flutes);
  
  // Calcola velocità di taglio
  const cuttingSpeed = (Math.PI * toolDiameter * rpm) / 1000;
  
  // Calcola la larghezza effettiva di taglio basata sullo stepover
  const effectiveStepover = (stepover / 100) * toolDiameter;
  
  // Calcola volume di materiale rimosso (molto approssimativo)
  // Uso un valore medio per la profondità basato su stepdown
  const materialRemovalRate = (feedrate * effectiveStepover * settings.stepdown) / 1000;
  
  return {
    cuttingSpeed: parseFloat(cuttingSpeed.toFixed(1)),
    chipLoad: parseFloat(chipLoad.toFixed(3)),
    materialRemovalRate: parseFloat(materialRemovalRate.toFixed(2)),
    effectiveStepover: parseFloat(effectiveStepover.toFixed(2))
  };
}

// Calcola il valore consigliato per la velocità di entrata
export function calculateRecommendedPlungeRate(feedrate: number): number {
  // Generalmente, la velocità di entrata è tra il 30% e il 50% della velocità di avanzamento
  return Math.round(feedrate * 0.4);
}

// Verifica se i parametri di taglio sono ottimali per il materiale selezionato
export function isFeedRateOptimal(settings: ToolpathSettings): boolean {
  const { material, toolDiameter, flutes, feedrate, rpm } = settings;
  
  const optimalChipLoad = calculateOptimalChipLoad(material, toolDiameter, flutes);
  const actualChipLoad = feedrate / (rpm * flutes);
  
  // Permette una tolleranza del ±15% rispetto al valore ottimale
  const lowerBound = optimalChipLoad * 0.85;
  const upperBound = optimalChipLoad * 1.15;
  
  return actualChipLoad >= lowerBound && actualChipLoad <= upperBound;
}

// Restituisci un messaggio di feedback sui parametri di taglio
export function getCuttingFeedback(settings: ToolpathSettings): string {
  const { material, feedrate, rpm, flutes } = settings;
  const actualChipLoad = feedrate / (rpm * flutes);
  const optimalChipLoad = calculateOptimalChipLoad(material, settings.toolDiameter, flutes);
  
  // Verifica se i parametri attuali sono ottimali
  if (isFeedRateOptimal(settings)) {
    return `✓ Avanzamento ottimale per ${material === 'aluminum' ? 'alluminio' : 
           material === 'steel' ? 'acciaio' : 
           material === 'wood' ? 'legno' : 
           material === 'brass' ? 'ottone' : 
           material === 'plastic' ? 'plastica' : 
           material === 'titanium' ? 'titanio' : 
           material === 'composite' ? 'composito' : 'questo materiale'}`;
  } else if (actualChipLoad < optimalChipLoad * 0.85) {
    return `⚠️ Avanzamento troppo basso per ${material}. Prova ad aumentarlo.`;
  } else {
    return `⚠️ Avanzamento troppo alto per ${material}. Considera di ridurlo.`;
  }
}
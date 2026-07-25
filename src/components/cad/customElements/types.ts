// types.ts - Custom Elements Type Definitions
// Non interferisce con il sistema esistente

export interface CustomElementParameter {
  type: 'number' | 'string' | 'boolean' | 'color' | 'vector3' | 'select';
  default: any;
  min?: number;
  max?: number;
  step?: number;
  options?: string[]; // per type select
  required?: boolean;
  description?: string;
  label?: string;
}

export interface CustomElementDefinition {
  id: string;
  name: string;
  description?: string;
  category?: string;
  tags?: string[];
  version?: string;
  author?: string;
  created: string;
  modified: string;
  
  // Parametri modificabili dall'utente
  parameters: Record<string, CustomElementParameter>;
  
  // Codice JavaScript per creare la geometria Three.js
  geometryCode: string;
  
  // Configurazione materiale (opzionale)
  materialConfig?: {
    type: 'standard' | 'basic' | 'physical' | 'custom';
    properties: Record<string, any>;
    customCode?: string; // Solo se type === 'custom'
  };
  
  // Impostazioni preview
  previewConfig?: {
    camera?: {
      position: [number, number, number];
      target: [number, number, number];
    };
    background?: string;
    lighting?: boolean;
  };
}

export interface CustomElementInstance {
  id: string;
  definitionId: string;
  parameters: Record<string, any>;
  position: { x: number; y: number; z: number };
  rotation?: { x: number; y: number; z: number };
  scale?: { x: number; y: number; z: number };
}

// Validazione risultati
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
}

// Template per elementi predefiniti
export interface CustomElementTemplate {
  name: string;
  description: string;
  category: string;
  tags: string[];
  parameters: Record<string, CustomElementParameter>;
  geometryCode: string;
  materialConfig?: CustomElementDefinition['materialConfig'];
  previewConfig?: CustomElementDefinition['previewConfig'];
}

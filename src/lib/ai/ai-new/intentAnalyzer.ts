// Crea un nuovo file: src/lib/ai/intentAnalyzer.ts

export interface DesignIntent {
    domain: 'mechanical' | 'architectural' | 'electronic' | 'consumer' | 'artistic';
    complexity: 'simple' | 'moderate' | 'complex' | 'engineering';
    precision: 'low' | 'standard' | 'high' | 'ultra';
    purpose: 'conceptual' | 'functional' | 'production' | 'presentation';
    keywords: string[];
  }
  
  export class IntentAnalyzer {
    // Analizza la descrizione per determinare l'intento del design
    static analyzeIntent(description: string): DesignIntent {
      const lowercased = description.toLowerCase();
      
      // Determina il dominio
      let domain: DesignIntent['domain'] = 'mechanical';
      if (lowercased.includes('building') || lowercased.includes('architecture') || 
          lowercased.includes('house') || lowercased.includes('room')) {
        domain = 'architectural';
      } else if (lowercased.includes('circuit') || lowercased.includes('pcb') || 
                 lowercased.includes('electronic')) {
        domain = 'electronic';
      } else if (lowercased.includes('art') || lowercased.includes('sculpture') || 
                 lowercased.includes('decorative')) {
        domain = 'artistic';
      } else if (lowercased.includes('product') || lowercased.includes('consumer') || 
                 lowercased.includes('household')) {
        domain = 'consumer';
      }
      
      // Determina la complessità
      let complexity: DesignIntent['complexity'] = 'moderate';
      if (lowercased.includes('simple') || lowercased.includes('basic')) {
        complexity = 'simple';
      } else if (lowercased.includes('complex') || lowercased.includes('detailed') || 
                 lowercased.includes('advanced')) {
        complexity = 'complex';
      } else if (lowercased.includes('precision') || lowercased.includes('engineering') || 
                 lowercased.includes('technical') || lowercased.includes('exact')) {
        complexity = 'engineering';
      }
      
      // Determina la precisione
      let precision: DesignIntent['precision'] = 'standard';
      if (lowercased.includes('rough') || lowercased.includes('concept')) {
        precision = 'low';
      } else if (lowercased.includes('precise') || lowercased.includes('accurate') || 
                 lowercased.includes('exact')) {
        precision = 'high';
      } else if (lowercased.includes('ultra-precise') || lowercased.includes('highest precision') || 
                 lowercased.includes('tolerance') || lowercased.includes('micron')) {
        precision = 'ultra';
      }
      
      // Determina lo scopo
      let purpose: DesignIntent['purpose'] = 'functional';
      if (lowercased.includes('concept') || lowercased.includes('idea') || 
          lowercased.includes('sketch')) {
        purpose = 'conceptual';
      } else if (lowercased.includes('manufacturing') || lowercased.includes('production') || 
                 lowercased.includes('fabrication')) {
        purpose = 'production';
      } else if (lowercased.includes('presentation') || lowercased.includes('display') || 
                 lowercased.includes('demo')) {
        purpose = 'presentation';
      }
      
      // Estrai parole chiave
      const keywords = this.extractKeywords(description);
      
      return {
        domain,
        complexity,
        precision,
        purpose,
        keywords
      };
    }
    
    // Estrai parole chiave rilevanti dalla descrizione
    private static extractKeywords(description: string): string[] {
      // Lista di parole chiave tecniche da cercare
      const technicalTerms = [
        'bolt', 'nut', 'screw', 'gear', 'bearing', 'shaft', 'flange', 'bracket',
        'housing', 'cylinder', 'piston', 'valve', 'pump', 'motor', 'coupling',
        'thread', 'weld', 'chamfer', 'fillet', 'tolerance', 'extrude', 'revolve',
        'sweep', 'loft', 'boolean', 'pattern', 'symmetry', 'draft', 'assembly',
        'align', 'constraint', 'mate', 'offset', 'mirror', 'array', 'dimension'
      ];
      
      // Lista di materiali da cercare
      const materials = [
        'steel', 'aluminum', 'titanium', 'brass', 'bronze', 'copper', 'iron',
        'plastic', 'abs', 'pla', 'nylon', 'delrin', 'acetal', 'ptfe', 'teflon',
        'wood', 'oak', 'pine', 'maple', 'carbon fiber', 'glass', 'ceramic', 
        'concrete', 'rubber', 'silicone', 'composite'
      ];
      
      // Lista di standard da cercare
      const standards = [
        'iso', 'din', 'ansi', 'asme', 'astm', 'aws', 'bs', 'jis', 'gb',
        'metric', 'imperial', 'npt', 'bsp', 'unf', 'unc', 'g', 'm', 'sae'
      ];
      
      const keywords: string[] = [];
      
      // Controllo per termini tecnici
      for (const term of technicalTerms) {
        if (description.toLowerCase().includes(term)) {
          keywords.push(term);
        }
      }
      
      // Controllo per materiali
      for (const material of materials) {
        if (description.toLowerCase().includes(material)) {
          keywords.push(material);
        }
      }
      
      // Controllo per standard
      for (const standard of standards) {
        if (description.toLowerCase().includes(standard)) {
          keywords.push(standard);
        }
      }
      
      // Estrai numeri che potrebbero essere dimensioni
      const dimensionMatches = description.match(/\b\d+(\.\d+)?\s*(mm|cm|m|in|inch|foot|ft)\b/g);
      if (dimensionMatches) {
        keywords.push(...dimensionMatches);
      }
      
      return keywords;
    }
    
    // Genera un prompt migliorato in base all'intento rilevato
    static enhancePromptWithIntent(description: string, intent: DesignIntent): string {
      let enhancedPrompt = description;
      
      // Aggiungi indicazioni specifiche per il dominio
      switch (intent.domain) {
        case 'mechanical':
          enhancedPrompt += "\n\nSi tratta di un componente meccanico. Includi dettagli tecnici come tolleranze, finiture superficiali e materiali ingegneristici appropriate. Utilizza tecniche come filetti, svasature, raccordi e smussi dove necessario.";
          break;
        case 'architectural':
          enhancedPrompt += "\n\nSi tratta di un elemento architettonico. Usa proporzioni realistiche, rispetta standard edilizi e considera aspetti strutturali e funzionali.";
          break;
        case 'electronic':
          enhancedPrompt += "\n\nSi tratta di un componente elettronico. Considera specifiche dimensioni standard per PCB, connettori e componenti. Includi dettagli come spessore del rame, distanze minime tra tracce e specifiche di materiale FR4.";
          break;
        // ... altri domini
      }
      
      // Aggiungi indicazioni specifiche per la precisione
      switch (intent.precision) {
        case 'low':
          enhancedPrompt += "\n\nUsa tolleranze generiche (±0.5mm) e dettagli approssimativi. Il modello è principalmente concettuale.";
          break;
          case 'standard':
            enhancedPrompt += "\n\nUsa tolleranze standard (±0.1mm) e dettagli coerenti con le pratiche ingegneristiche comuni. Specifica finiture superficiali Ra e materiali appropriati.";
            break;
          case 'high':
            enhancedPrompt += "\n\nUsa tolleranze strette (±0.05mm) e dettagli tecnici precisi. Includi specifiche complete di materiale, riferimenti a standard industriali, e considerazioni di producibilità come angoli di sformo e raggi minimi.";
            break;
          case 'ultra':
            enhancedPrompt += "\n\nUsa tolleranze ultra-precise (±0.01mm), classi di accoppiamento ISO, e dettagli tecnici estremamente accurati. Specifica trattamenti termici, finiture superficiali precise (Ra 0.8 o migliori), e includi metadati per controllo qualità.";
            break;
        }
        
        // Aggiungi indicazioni specifiche per lo scopo
        switch (intent.purpose) {
          case 'conceptual':
            enhancedPrompt += "\n\nConcentrati sulla forma generale e le proporzioni piuttosto che sui dettagli minuti.";
            break;
          case 'functional':
            enhancedPrompt += "\n\nConcentrati sulla funzionalità e l'interoperabilità tra componenti. Considera vincoli di montaggio e aspetti ergonomici.";
            break;
          case 'production':
            enhancedPrompt += "\n\nOttimizza il design per la produzione. Considera processi di fabbricazione come fresatura CNC, stampa 3D, o stampaggio a iniezione. Includi sovrametalli per lavorazioni successive e note di fabbricazione.";
            break;
          case 'presentation':
            enhancedPrompt += "\n\nOttimizza il design per l'aspetto visivo. Aggiungi dettagli estetici e usa materiali con finiture adeguate per la presentazione.";
            break;
        }
        
        // Aggiungi indicazioni basate su parole chiave rilevate
        if (intent.keywords.includes('assembly') || intent.keywords.includes('mate')) {
          enhancedPrompt += "\n\nConsidera l'assemblaggio tra componenti multipli. Usa bulloni, viti, o altri elementi di fissaggio dove appropriato.";
        }
        
        if (intent.keywords.some(keyword => ['tolerance', 'precise', 'accuracy'].includes(keyword))) {
          enhancedPrompt += "\n\nPresta particolare attenzione alle tolleranze e alle precisioni dimensionali.";
        }
        
        // Aggiungi riferimenti a standard se rilevanti
        const standardsKeywords = intent.keywords.filter(keyword => ['iso', 'din', 'ansi', 'asme'].includes(keyword));
        if (standardsKeywords.length > 0) {
          enhancedPrompt += `\n\nUtilizza standard ${standardsKeywords.join(', ').toUpperCase()} dove appropriato.`;
        }
        
        return enhancedPrompt;
      }
    }
export interface SearchPattern {
  pattern: RegExp;
  description: string;
  category: "direct" | "info" | "external" | "web_keywords";
}

export class WebSearchHelper {
  // Pattern diretti per websearch
  static directSearchPatterns: SearchPattern[] = [
    { pattern: /^cerca\s+/i, description: "Cerca + query", category: "direct" },
    { pattern: /^search\s+/i, description: "Search + query", category: "direct" },
    { pattern: /^find\s+/i, description: "Find + query", category: "direct" },
    { pattern: /^look\s+up\s+/i, description: "Look up + query", category: "direct" },
    { pattern: /^google\s+/i, description: "Google + query", category: "direct" },
    { pattern: /^ricerca\s+/i, description: "Ricerca + query", category: "direct" }
  ];

  // Pattern informativi che richiedono ricerca
  static infoPatterns: SearchPattern[] = [
    { pattern: /what\s+(is|are)\s+/i, description: "What is/are questions", category: "info" },
    { pattern: /how\s+to\s+/i, description: "How to questions", category: "info" },
    { pattern: /where\s+can\s+i\s+/i, description: "Where can I questions", category: "info" },
    { pattern: /who\s+(is|are)\s+/i, description: "Who is/are questions", category: "info" },
    { pattern: /when\s+(was|is)\s+/i, description: "When questions", category: "info" },
    { pattern: /why\s+(is|are|do|does)\s+/i, description: "Why questions", category: "info" },
    { pattern: /cos[aè]\s+[èe]\s+/i, description: "Cosa è questions (IT)", category: "info" },
    { pattern: /come\s+(si\s+)?fa\s+/i, description: "Come si fa questions (IT)", category: "info" },
    { pattern: /dove\s+posso\s+/i, description: "Dove posso questions (IT)", category: "info" },
    { pattern: /quando\s+[èe]\s+/i, description: "Quando è questions (IT)", category: "info" },
    { pattern: /perch[èe]\s+/i, description: "Perché questions (IT)", category: "info" }
  ];

  // Pattern che suggeriscono ricerca di informazioni esterne
  static externalInfoPatterns: SearchPattern[] = [
    { pattern: /latest\s+/i, description: "Latest information", category: "external" },
    { pattern: /current\s+/i, description: "Current information", category: "external" },
    { pattern: /news\s+about\s+/i, description: "News queries", category: "external" },
    { pattern: /reviews\s+of\s+/i, description: "Review requests", category: "external" },
    { pattern: /price\s+of\s+/i, description: "Price inquiries", category: "external" },
    { pattern: /cost\s+of\s+/i, description: "Cost inquiries", category: "external" },
    { pattern: /specifications\s+of\s+/i, description: "Spec requests", category: "external" },
    { pattern: /comparison\s+between\s+/i, description: "Comparison requests", category: "external" },
    { pattern: /best\s+practices\s+for\s+/i, description: "Best practices", category: "external" },
    { pattern: /tutorial\s+for\s+/i, description: "Tutorial requests", category: "external" },
    { pattern: /guide\s+to\s+/i, description: "Guide requests", category: "external" },
    { pattern: /ultimd?e\s+notizie\s+/i, description: "Ultime notizie (IT)", category: "external" },
    { pattern: /prezzo\s+di\s+/i, description: "Prezzo inquiries (IT)", category: "external" },
    { pattern: /costo\s+di\s+/i, description: "Costo inquiries (IT)", category: "external" },
    { pattern: /specifiche\s+di\s+/i, description: "Specifiche (IT)", category: "external" },
    { pattern: /confronto\s+tra\s+/i, description: "Confronto (IT)", category: "external" },
    { pattern: /migliori\s+pratiche\s+/i, description: "Migliori pratiche (IT)", category: "external" },
    { pattern: /tutorial\s+per\s+/i, description: "Tutorial per (IT)", category: "external" },
    { pattern: /guida\s+a\s+/i, description: "Guida a (IT)", category: "external" }
  ];

  // Parole chiave che suggeriscono ricerca di informazioni online
  static webKeywords = [
    "online",
    "website",
    "link",
    "url",
    "download",
    "buy",
    "purchase",
    "store",
    "shop",
    "market",
    "supplier",
    "vendor",
    "manufacturer",
    "documentation",
    "manual",
    "datasheet",
    "catalog",
    "standard",
    "industry",
    "trends",
    "market",
    "competitors",
    "alternative",
    "sito",
    "collegamento",
    "scaricare",
    "comprare",
    "acquistare",
    "negozio",
    "mercato",
    "fornitore",
    "produttore",
    "documentazione",
    "manuale",
    "catalogo",
    "standard",
    "settore",
    "tendenze",
    "concorrenti"
  ];

  // Parole chiave CAD interne (da escludere dalla websearch)
  static cadInternalKeywords = [
    "create",
    "generate",
    "make",
    "draw",
    "model",
    "design",
    "build",
    "construct",
    "add",
    "modify",
    "edit",
    "delete",
    "move",
    "rotate",
    "crea",
    "genera",
    "disegna",
    "modella",
    "progetta",
    "costruisci",
    "aggiungi",
    "modifica",
    "elimina",
    "sposta",
    "ruota"
  ];

  /**
   * Determina se un messaggio è una richiesta di websearch
   */
  static isWebSearchQuery(message: string): {
    isWebSearch: boolean;
    confidence: number;
    matchedPatterns: SearchPattern[];
    cleanQuery: string;
  } {
    const lowerMessage = message.toLowerCase().trim();
    const matchedPatterns: SearchPattern[] = [];
    let confidence = 0;

    // Check pattern diretti (alta confidenza)
    for (const searchPattern of this.directSearchPatterns) {
      if (searchPattern.pattern.test(lowerMessage)) {
        matchedPatterns.push(searchPattern);
        confidence += 0.9;
      }
    }

    // Check pattern informativi (media-alta confidenza)
    for (const infoPattern of this.infoPatterns) {
      if (infoPattern.pattern.test(lowerMessage)) {
        matchedPatterns.push(infoPattern);
        confidence += 0.7;
      }
    }

    // Check pattern informazioni esterne (media confidenza)
    for (const externalPattern of this.externalInfoPatterns) {
      if (externalPattern.pattern.test(lowerMessage)) {
        matchedPatterns.push(externalPattern);
        confidence += 0.6;
      }
    }

    // Check parole chiave web (bassa confidenza, ma combinata)
    const hasWebKeywords = this.webKeywords.some(keyword => lowerMessage.includes(keyword));

    if (hasWebKeywords) {
      matchedPatterns.push({
        pattern: new RegExp("web_keywords"),
        description: "Contains web-related keywords",
        category: "web_keywords"
      });
      confidence += 0.4;
    }

    // Verifica se è chiaramente una richiesta CAD interna (riduce confidenza)
    const isInternalCAD = this.cadInternalKeywords.some(keyword => lowerMessage.startsWith(keyword));

    if (isInternalCAD) {
      confidence -= 0.5;
    }

    // Pulisci la query rimuovendo prefissi
    const cleanQuery = this.cleanSearchQuery(message);

    // Determina se è websearch (soglia di confidenza)
    const isWebSearch = confidence >= 0.5 && !isInternalCAD;

    return {
      isWebSearch,
      confidence: Math.max(0, Math.min(1, confidence)),
      matchedPatterns,
      cleanQuery
    };
  }

  /**
   * Pulisce la query rimuovendo prefissi di ricerca
   */
  static cleanSearchQuery(query: string): string {
    let cleanQuery = query.trim();

    // Rimuovi prefissi di ricerca comuni
    const prefixPatterns = [
      /^(cerca|search|find|look up|google|ricerca)\s+/i,
      /^(what is|what are|cos[aè] è)\s+/i,
      /^(how to|come si fa)\s+/i,
      /^(where can i|dove posso)\s+/i
    ];

    for (const pattern of prefixPatterns) {
      cleanQuery = cleanQuery.replace(pattern, "");
    }

    return cleanQuery.trim() || query.trim();
  }

  /**
   * Genera suggerimenti di ricerca basati sul contesto CAD/CAM
   */
  static generateCADSearchSuggestions(query: string): string[] {
    const suggestions: string[] = [];
    const lowerQuery = query.toLowerCase();

    // Suggerimenti basati su parole chiave CAD/CAM
    if (lowerQuery.includes("aluminum") || lowerQuery.includes("alluminio")) {
      suggestions.push("aluminum 6061 machining parameters");
      suggestions.push("aluminum cutting speeds and feeds");
      suggestions.push("aluminum surface finish techniques");
    }

    if (lowerQuery.includes("cnc") || lowerQuery.includes("machining")) {
      suggestions.push("CNC machining best practices");
      suggestions.push("CNC programming tutorials");
      suggestions.push("CNC machine selection guide");
    }

    if (lowerQuery.includes("cad") || lowerQuery.includes("design")) {
      suggestions.push("CAD software comparison 2024");
      suggestions.push("CAD modeling techniques");
      suggestions.push("CAD file formats explained");
    }

    if (lowerQuery.includes("3d print") || lowerQuery.includes("additive")) {
      suggestions.push("3D printing materials comparison");
      suggestions.push("3D printing design guidelines");
      suggestions.push("FDM vs SLA comparison");
    }

    // Suggerimenti generici se nessun match specifico
    if (suggestions.length === 0) {
      suggestions.push(`${query} tutorial`);
      suggestions.push(`${query} best practices`);
      suggestions.push(`${query} specifications`);
    }

    return suggestions.slice(0, 5);
  }

  /**
   * Crea contesto CAD ottimizzato per la ricerca
   */
  static createCADSearchContext(contextData: any) {
    return {
      projectType: contextData?.projectType || "CAD/CAM",
      materials: contextData?.materials || [],
      machineType: contextData?.machineType,
      currentOperation: contextData?.currentOperation,
      technicalTerms: [
        "CAD",
        "CAM",
        "CNC",
        "machining",
        "manufacturing",
        "engineering",
        "design",
        "modeling",
        "simulation",
        "toolpath",
        "gcode",
        "additive manufacturing",
        "3D printing",
        "precision",
        "tolerance",
        "surface finish"
      ]
    };
  }

  /**
   * Analizza i risultati di ricerca per rilevanza CAD/CAM
   */
  // static analyzeSearchRelevance(results: any[], query: string): any[] { // Commented out or remove
  //   // Parole chiave CAD/CAM per boost della rilevanza
  //   const cadKeywords = [
  //     'cad', 'cam', 'cnc', 'machining', 'manufacturing', 'engineering',
  //     'design', 'modeling', 'simulation', 'autocad', 'solidworks',
  //     'fusion360', 'inventor', 'catia', 'nx', 'creo'
  //   ];

  //   return results.map(result => {
  //     let relevanceBoost = 0;
  //     const text = `${result.title} ${result.snippet}`.toLowerCase();

  //     // Boost per parole chiave CAD/CAM
  //     cadKeywords.forEach(keyword => {
  //       if (text.includes(keyword)) {
  //         relevanceBoost += 0.1;
  //       }
  //     });

  //     // Boost per corrispondenza diretta con query
  //     if (text.includes(query.toLowerCase())) {
  //       relevanceBoost += 0.2;
  //     }

  //     // Boost per siti autorevoili nel settore CAD/CAM
  //     const authoritativeDomains = [
  //       'autodesk.com', 'solidworks.com', 'siemens.com',
  //       'cnccookbook.com', 'practicalmachinist.com',
  //       'machiningcloud.com', 'engineering.com'
  //     ];

  //     authoritativeDomains.forEach(domain => {
  //       if (result.url && result.url.includes(domain)) {
  //         relevanceBoost += 0.15;
  //       }
  //     });

  //     return {
  //       ...result,
  //       relevanceScore: Math.min(1, (result.relevanceScore || 0) + relevanceBoost),
  //       cadRelevant: relevanceBoost > 0
  //     };
  //   }).sort((a, b) => b.relevanceScore - a.relevanceScore);
  // }
}

export default WebSearchHelper;

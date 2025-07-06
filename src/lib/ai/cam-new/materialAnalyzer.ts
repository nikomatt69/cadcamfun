// src/lib/ai/cam-new/materialAnalyzer.ts
import { v4 as uuidv4 } from "uuid";
import { Material, Tool, MachiningOperation, CoolantType, MaterialType, ToolType } from "../../../types/CAMTypes";
import { aiAnalytics } from "../ai-new/aiAnalytics";

/**
 * Classe per l'analisi dei materiali in relazione alle operazioni CAM
 */
export class MaterialAnalyzer {
  /**
   * Analizza un materiale e fornisce raccomandazioni per la lavorazione
   */
  async analyzeMaterial(material: Material, tools?: Tool[], operation?: MachiningOperation): Promise<any> {
    // Traccia l'analisi per analytics
    aiAnalytics.trackEvent({
      eventType: "cam_analyzer",
      eventName: "analyze_material",
      metadata: {
        materialId: material.id,
        materialName: material.name,
        materialType: material.type
      }
    });

    const startTime = Date.now();

    try {
      // Genera le raccomandazioni per il materiale
      const recommendations = this.generateMaterialRecommendations(material, tools, operation);

      // Calcola i parametri di lavorazione ottimali
      const optimalParameters = this.calculateOptimalParameters(material, tools, operation);

      // Genera consigli per problemi comuni
      const commonIssues = this.identifyCommonIssues(material);

      // Suggerisci utensili compatibili
      const toolRecommendations = this.recommendTools(material, tools);

      // Assembla l'analisi completa
      const analysis = {
        id: uuidv4(),
        materialId: material.id,
        materialName: material.name,
        materialType: material.type,
        recommendations,
        optimalParameters,
        commonIssues,
        toolRecommendations
      };

      // Traccia il completamento dell'analisi
      aiAnalytics.trackEvent({
        eventType: "cam_analyzer",
        eventName: "material_analysis_complete",
        duration: Date.now() - startTime,
        success: true,
        metadata: {
          materialId: material.id,
          recommendationsCount: recommendations.length,
          toolRecommendationsCount: toolRecommendations.length
        }
      });

      return analysis;
    } catch (error) {
      // Traccia l'errore
      aiAnalytics.trackEvent({
        eventType: "error",
        eventName: "material_analysis_error",
        success: false,
        metadata: {
          materialId: material.id,
          error: error instanceof Error ? error.message : "Unknown error"
        }
      });

      throw error;
    }
  }

  /**
   * Genera raccomandazioni generali per la lavorazione del materiale
   */
  private generateMaterialRecommendations(material: Material, tools?: Tool[], operation?: MachiningOperation): any[] {
    const recommendations: any[] = [];

    // Raccomandazioni basate sul tipo di materiale
    switch (material.type) {
      case "aluminum":
        recommendations.push({
          id: uuidv4(),
          type: "general",
          description: "L'alluminio ha un'ottima lavorabilità ma tende a produrre bave e aderire agli utensili",
          recommendations: [
            "Usare lubrificanti o refrigeranti per evitare l'adesione agli utensili",
            "Mantenere velocità di taglio elevate per evitare la formazione di bave",
            "Utilizzare preferibilmente frese a 2-3 taglienti per alluminio",
            "Impiegare refrigerazione abbondante per evacuare i trucioli"
          ],
          importance: "high"
        });
        break;

      case "steel":
        recommendations.push({
          id: uuidv4(),
          type: "general",
          description: "L'acciaio richiede strategie specifiche a causa della sua durezza e resistenza al calore",
          recommendations: [
            "Utilizzare velocità di taglio moderate",
            "Impiegare refrigerazione abbondante per gestire il calore",
            "Preferire utensili rivestiti in TiN o TiAlN",
            "Utilizzare frese con più taglienti per distribuire il carico",
            "Ridurre la profondità di taglio a favore di un maggiore stepover"
          ],
          importance: "high"
        });
        break;

      case "stainless_steel":
        recommendations.push({
          id: uuidv4(),
          type: "general",
          description:
            "L'acciaio inossidabile è difficile da lavorare per la sua durezza e bassa conducibilità termica",
          recommendations: [
            "Ridurre velocità di taglio e aumentare l'avanzamento per evitare l'incrudimento",
            "Utilizzare utensili con angoli di spoglia positivi",
            "Mantenere un'abbondante refrigerazione per gestire il calore",
            "Evitare interruzioni durante il taglio per prevenire l'incrudimento",
            "Preferire utensili rivestiti in AlTiN o ZrN per resistere all'abrasione e al calore"
          ],
          importance: "critical"
        });
        break;

      case "titanium":
        recommendations.push({
          id: uuidv4(),
          type: "general",
          description: "Il titanio richiede attenzione particolare per la sua reattività e bassa conducibilità termica",
          recommendations: [
            "Utilizzare velocità di taglio molto basse (30-60% rispetto all'acciaio)",
            "Mantenere avanzamenti più elevati per evitare l'incrudimento",
            "Impiegare refrigerazione abbondante, preferibilmente ad alta pressione",
            "Evitare interruzioni durante il taglio",
            "Utilizzare utensili con geometrie specifiche per titanio",
            "Preferire operazioni di sgrossatura con frese toroidali"
          ],
          importance: "critical"
        });
        break;

      case "plastic":
        recommendations.push({
          id: uuidv4(),
          type: "general",
          description: "I materiali plastici richiedono strategie per gestire il calore e prevenire la fusione",
          recommendations: [
            "Utilizzare velocità di taglio elevate e avanzamenti moderati",
            "Preferire utensili appositamente progettati per plastiche",
            "Impiegare refrigerazione ad aria compressa invece di liquidi",
            "Assicurare un evacuazione efficiente dei trucioli per evitare rifusioni",
            "Per materiali termoplastici, evitare il surriscaldamento che porterebbe alla fusione"
          ],
          importance: "medium"
        });
        break;

      case "wood":
        recommendations.push({
          id: uuidv4(),
          type: "general",
          description: "Il legno richiede strategie per gestire la polvere e prevenire scheggiature",
          recommendations: [
            "Utilizzare velocità di taglio molto elevate",
            "Preferire utensili specifici per legno con geometrie di taglio appropriate",
            "Impiegare aspirazione per gestire le polveri",
            "Considerare la direzione delle fibre durante la programmazione del percorso",
            "Utilizzare taglienti molto affilati per prevenire scheggiature"
          ],
          importance: "medium"
        });
        break;

      case "composite":
        recommendations.push({
          id: uuidv4(),
          type: "general",
          description:
            "I materiali compositi richiedono strategie specifiche per gestire l'abrasività e prevenire delaminazioni",
          recommendations: [
            "Utilizzare utensili specifici per compositi, preferibilmente in carburo di tungsteno con rivestimento diamantato",
            "Mantenere velocità di taglio elevate e avanzamenti moderati",
            "Evitare il surriscaldamento che può danneggiare la matrice",
            "Considerare percorsi di lavorazione che minimizzano la delaminazione",
            "Utilizzare supporti adeguati per prevenire vibrazioni"
          ],
          importance: "high"
        });
        break;

      default:
        recommendations.push({
          id: uuidv4(),
          type: "general",
          description: "Raccomandazioni generali per la lavorazione dei materiali",
          recommendations: [
            "Selezionare utensili appropriati per il materiale specifico",
            "Utilizzare refrigerazione adeguata per gestire il calore",
            "Ottimizzare i parametri di taglio in base alle proprietà del materiale",
            "Considerare la durezza e la conducibilità termica del materiale",
            "Eseguire test preliminari su scarti del materiale per ottimizzare i parametri"
          ],
          importance: "medium"
        });
    }

    // Raccomandazioni basate sulla durezza del materiale
    if (material.hardness) {
      recommendations.push({
        id: uuidv4(),
        type: "hardness",
        description: `Considerazioni per materiale con durezza ${material.hardness}`,
        recommendations: this.generateHardnessRecommendations(material),
        importance: material.hardness > 45 ? "high" : "medium"
      });
    }

    // Raccomandazioni basate sulla machinability
    if (material.machinability) {
      recommendations.push({
        id: uuidv4(),
        type: "machinability",
        description: `Considerazioni per materiale con indice di machinability ${material.machinability}%`,
        recommendations: this.generateMachinabilityRecommendations(material),
        importance: material.machinability < 50 ? "high" : "medium"
      });
    }

    // Raccomandazioni per specifici tipi di operazione
    if (operation) {
      recommendations.push({
        id: uuidv4(),
        type: "operation",
        description: `Raccomandazioni specifiche per operazione ${operation.type} su ${material.name}`,
        recommendations: this.generateOperationRecommendations(material, operation),
        importance: "high"
      });
    }

    return recommendations;
  }

  /**
   * Genera raccomandazioni basate sulla durezza del materiale
   */
  private generateHardnessRecommendations(material: Material): string[] {
    const recommendations: string[] = [];

    // Classifica la durezza (assumendo scala HRC)
    if (!material.hardness) {
      return recommendations;
    }

    const hardness = material.hardness;

    if (hardness < 20) {
      recommendations.push("Materiale relativamente morbido, utilizzare utensili con angoli di spoglia positivi");
      recommendations.push("Aumentare la velocità di taglio per migliorare la finitura superficiale");
      recommendations.push("Utilizzare refrigerazione per evitare la formazione di bave");
    } else if (hardness >= 20 && hardness < 35) {
      recommendations.push("Materiale di durezza media, bilanciare velocità e avanzamento");
      recommendations.push("Utilizzare utensili in carburo di tungsteno o HSS di alta qualità");
      recommendations.push("Impiegare refrigerazione per gestire il calore");
    } else if (hardness >= 35 && hardness < 50) {
      recommendations.push("Materiale duro, ridurre la velocità di taglio del 30-40%");
      recommendations.push("Utilizzare utensili in carburo con rivestimenti TiAlN o AlCrN");
      recommendations.push("Aumentare la rigidità del setup di lavorazione");
      recommendations.push("Considerare strategie di lavorazione trocoidale");
    } else {
      recommendations.push("Materiale estremamente duro, ridurre la velocità di taglio del 50-60%");
      recommendations.push("Utilizzare utensili in carburo rivestito o ceramici");
      recommendations.push("Ridurre la profondità di taglio e aumentare i passaggi");
      recommendations.push("Considerare pre-trattamenti termici per ridurre la durezza prima della lavorazione");
      recommendations.push("Valutare tecnologie alternative come EDM per geometrie complesse");
    }

    return recommendations;
  }

  /**
   * Genera raccomandazioni basate sull'indice di machinability
   */
  private generateMachinabilityRecommendations(material: Material): string[] {
    const recommendations: string[] = [];

    if (!material.machinability) {
      return recommendations;
    }

    const machinability = material.machinability;

    if (machinability < 30) {
      recommendations.push("Materiale con machinability molto bassa, lavorazione estremamente difficile");
      recommendations.push("Ridurre drasticamente i parametri di taglio (velocità -60%, avanzamento -50%)");
      recommendations.push("Utilizzare utensili specifici per materiali difficili da lavorare");
      recommendations.push("Considerare passaggi multipli con minima rimozione di materiale per volta");
      recommendations.push("Valutare tecnologie alternative (EDM, waterjet, ecc.)");
    } else if (machinability >= 30 && machinability < 50) {
      recommendations.push("Materiale con machinability bassa, lavorazione difficile");
      recommendations.push("Ridurre i parametri di taglio (velocità -40%, avanzamento -30%)");
      recommendations.push("Utilizzare utensili in carburo con rivestimenti avanzati");
      recommendations.push("Prevedere frequenti verifiche dell'usura utensile");
      recommendations.push("Implementare refrigerazione abbondante e ad alta pressione");
    } else if (machinability >= 50 && machinability < 70) {
      recommendations.push("Materiale con machinability media, lavorazione moderatamente impegnativa");
      recommendations.push("Ridurre leggermente i parametri di taglio (velocità -20%, avanzamento -10%)");
      recommendations.push("Utilizzare refrigerazione standard");
      recommendations.push("Monitorare l'usura utensile regolarmente");
    } else {
      recommendations.push("Materiale con buona machinability, lavorazione relativamente semplice");
      recommendations.push("Utilizzare parametri di taglio standard o leggermente aumentati");
      recommendations.push("Possibilità di aumentare la produttività ottimizzando i percorsi utensile");
    }

    return recommendations;
  }

  /**
   * Genera raccomandazioni specifiche per un'operazione su un materiale
   */
  private generateOperationRecommendations(material: Material, operation: MachiningOperation): string[] {
    const recommendations: string[] = [];

    // Raccomandazioni per sgrossatura
    if (operation.type.includes("adaptive") || operation.type === "2d_pocket") {
      recommendations.push("Per sgrossatura su questo materiale:");

      if (material.type === "aluminum") {
        recommendations.push("- Utilizzare percorsi trocoidali con alto avanzamento");
        recommendations.push("- Mantenere un impegno radiale del 15-20% del diametro utensile");
        recommendations.push("- Considerare frese a inserti per massima produttività");
      } else if (material.type === "stainless_steel" || material.type === "titanium") {
        recommendations.push("- Ridurre la velocità del mandrino del 40-50% rispetto all'acciaio standard");
        recommendations.push("- Mantenere un impegno radiale del 10-15% del diametro utensile");
        recommendations.push("- Utilizzare strategie che mantengono costante il carico sull'utensile");
      } else if (material.type === "plastic") {
        recommendations.push("- Utilizzare frese a taglienti singolo o doppio specifiche per plastica");
        recommendations.push("- Aumentare la velocità del mandrino per evitare fusioni");
        recommendations.push("- Mantenere avanzamenti elevati per tagliare invece di fondere");
      }
    }

    // Raccomandazioni per finitura
    if (
      operation.type.includes("contour") ||
      operation.type.includes("parallel") ||
      operation.type.includes("scallop")
    ) {
      recommendations.push("Per finitura su questo materiale:");

      if (material.type === "aluminum") {
        recommendations.push("- Utilizzare velocità di taglio elevate per finitura lucida");
        recommendations.push("- Considerare frese a diamante per finitura a specchio se necessario");
        recommendations.push("- Ridurre l'altezza di stepover al 5-10% del diametro utensile");
      } else if (material.type === "stainless_steel" || material.type === "titanium") {
        recommendations.push("- Utilizzare utensili rivestiti con geometria di taglio positiva");
        recommendations.push("- Mantenere avanzamento costante per evitare l'incrudimento");
        recommendations.push("- Considerare utensili ball nose per superfici 3D");
      } else if (material.type === "plastic") {
        recommendations.push("- Utilizzare frese lucidate con angoli di spoglia elevati");
        recommendations.push("- Aumentare la velocità del mandrino per finitura lucida");
        recommendations.push("- Considerare una passata finale leggera a velocità molto elevata");
      }
    }

    // Raccomandazioni per foratura
    if (operation.type === "drilling" || operation.type === "boring") {
      recommendations.push("Per foratura su questo materiale:");

      if (material.type === "aluminum") {
        recommendations.push("- Utilizzare punte con angolo di punta di 130-140 gradi");
        recommendations.push("- Implementare cicli di foratura con rompi-truciolo");
        recommendations.push("- Considerare refrigerazione interna all'utensile se disponibile");
      } else if (material.type === "stainless_steel" || material.type === "titanium") {
        recommendations.push("- Utilizzare punte con angolo di punta di 135-140 gradi");
        recommendations.push("- Ridurre la velocità di taglio del 50-60% rispetto all'acciaio normale");
        recommendations.push("- Implementare cicli di foratura con spezza-truciolo frequenti (peck drilling)");
      } else if (material.type === "plastic") {
        recommendations.push("- Utilizzare punte specifiche per plastiche con angolo di punta di 60-90 gradi");
        recommendations.push("- Mantenere elevata velocità di avanzamento per evitare fusioni");
        recommendations.push("- Considerare refrigerazione ad aria per espellere i trucioli");
      }
    }

    return recommendations;
  }

  /**
   * Calcola i parametri di lavorazione ottimali per un materiale
   */
  private calculateOptimalParameters(material: Material, tools?: Tool[], operation?: MachiningOperation): any {
    // Parametri di base
    const baseParameters = {
      cuttingSpeed: 0, // m/min
      feedPerTooth: 0, // mm
      depthOfCut: 0, // mm
      stepover: 0, // Percentuale del diametro utensile
      coolant: "flood" as CoolantType,
      notes: ""
    };

    // Adatta i parametri in base al tipo di materiale
    switch (material.type) {
      case "aluminum":
        baseParameters.cuttingSpeed = 300; // m/min
        baseParameters.feedPerTooth = 0.1; // mm
        baseParameters.depthOfCut = 1.0; // mm
        baseParameters.stepover = 0.5; // 50% del diametro
        baseParameters.coolant = "flood";
        baseParameters.notes = "Refrigerazione abbondante raccomandata per alluminio";
        break;

      case "steel":
        baseParameters.cuttingSpeed = 100; // m/min
        baseParameters.feedPerTooth = 0.08; // mm
        baseParameters.depthOfCut = 0.8; // mm
        baseParameters.stepover = 0.4; // 40% del diametro
        baseParameters.coolant = "flood";
        baseParameters.notes = "Utilizzare emulsione ad alta pressione per acciaio";
        break;

      case "stainless_steel":
        baseParameters.cuttingSpeed = 60; // m/min
        baseParameters.feedPerTooth = 0.06; // mm
        baseParameters.depthOfCut = 0.5; // mm
        baseParameters.stepover = 0.3; // 30% del diametro
        baseParameters.coolant = "flood";
        baseParameters.notes = "Refrigerazione essenziale; considerare strategia trocoidale";
        break;

      case "titanium":
        baseParameters.cuttingSpeed = 40; // m/min
        baseParameters.feedPerTooth = 0.05; // mm
        baseParameters.depthOfCut = 0.4; // mm
        baseParameters.stepover = 0.2; // 20% del diametro
        baseParameters.coolant = "flood";
        baseParameters.notes = "Refrigerazione ad alta pressione raccomandata; evitare interruzioni nel taglio";
        break;

      case "plastic":
        baseParameters.cuttingSpeed = 200; // m/min
        baseParameters.feedPerTooth = 0.15; // mm
        baseParameters.depthOfCut = 1.5; // mm
        baseParameters.stepover = 0.6; // 60% del diametro
        baseParameters.coolant = "air_blast";
        baseParameters.notes = "Evitare refrigerazione liquida; utilizzare aria compressa per evacuare trucioli";
        break;

      case "wood":
        baseParameters.cuttingSpeed = 400; // m/min
        baseParameters.feedPerTooth = 0.2; // mm
        baseParameters.depthOfCut = 3.0; // mm
        baseParameters.stepover = 0.7; // 70% del diametro
        baseParameters.coolant = "none";
        baseParameters.notes = "Aspirazione raccomandata per polveri; evitare refrigeranti liquidi";
        break;

      case "composite":
        baseParameters.cuttingSpeed = 150; // m/min
        baseParameters.feedPerTooth = 0.1; // mm
        baseParameters.depthOfCut = 0.8; // mm
        baseParameters.stepover = 0.4; // 40% del diametro
        baseParameters.coolant = "mist";
        baseParameters.notes = "Utensili specifici per compositi consigliati; aspirazione per polveri";
        break;

      default:
        baseParameters.cuttingSpeed = 100; // m/min
        baseParameters.feedPerTooth = 0.1; // mm
        baseParameters.depthOfCut = 1.0; // mm
        baseParameters.stepover = 0.4; // 40% del diametro
        baseParameters.coolant = "flood";
        baseParameters.notes = "Parametri generici; adattare in base a test specifici";
    }

    // Adatta i parametri in base alla durezza
    if (material.hardness) {
      const hardnessMultiplier = Math.max(0.3, 1 - material.hardness / 100);
      baseParameters.cuttingSpeed *= hardnessMultiplier;
      baseParameters.feedPerTooth *= hardnessMultiplier;
      baseParameters.depthOfCut *= hardnessMultiplier;
      baseParameters.stepover *= hardnessMultiplier;
    }

    // Adatta i parametri in base alla machinability
    if (material.machinability) {
      const machinabilityMultiplier = material.machinability / 100;
      baseParameters.cuttingSpeed *= machinabilityMultiplier;
      baseParameters.depthOfCut *= machinabilityMultiplier;
    }

    // Parametri per tutte le operazioni comuni
    const operationParameters: Record<string, any> = {
      roughing: {
        ...baseParameters,
        cuttingSpeed: baseParameters.cuttingSpeed * 0.8,
        feedPerTooth: baseParameters.feedPerTooth * 1.2,
        depthOfCut: baseParameters.depthOfCut * 1.5,
        stepover: baseParameters.stepover * 1.2
      },
      finishing: {
        ...baseParameters,
        cuttingSpeed: baseParameters.cuttingSpeed * 1.2,
        feedPerTooth: baseParameters.feedPerTooth * 0.8,
        depthOfCut: baseParameters.depthOfCut * 0.5,
        stepover: baseParameters.stepover * 0.5
      },
      drilling: {
        ...baseParameters,
        cuttingSpeed: baseParameters.cuttingSpeed * 0.7,
        feedPerTooth: baseParameters.feedPerTooth * 1.0,
        depthOfCut: baseParameters.depthOfCut * 1.0, // Non applicabile per foratura
        stepover: 1.0, // Non applicabile per foratura
        notes: baseParameters.notes + "; Utilizzare cicli di foratura con rompi-truciolo"
      }
    };

    // Parametri per operazioni specifiche
    if (operation) {
      switch (operation.type) {
        case "2d_adaptive":
        case "3d_adaptive":
        case "2d_pocket":
          return {
            ...operationParameters.roughing,
            stepover: operationParameters.roughing.stepover * 0.5, // Valori più conservativi per adaptive
            notes: operationParameters.roughing.notes + "; Mantenere impegno radiale costante"
          };

        case "2d_contour":
        case "3d_contour":
        case "3d_parallel":
        case "3d_scallop":
          return {
            ...operationParameters.finishing,
            notes: operationParameters.finishing.notes + "; Ottimizzare per finitura superficiale"
          };

        case "drilling":
          return operationParameters.drilling;

        default:
          // Se l'operazione non è tra quelle sopra, restituisci i parametri base
          return baseParameters;
      }
    }

    // Se non ci sono operazioni specificate, restituisci tutti i parametri operazione
    return {
      baseParameters,
      operationParameters
    };
  }

  /**
   * Identifica problemi comuni nella lavorazione del materiale
   */
  private identifyCommonIssues(material: Material): any[] {
    const issues: any[] = [];

    // Problemi comuni per tipo di materiale
    switch (material.type) {
      case "aluminum":
        issues.push({
          id: uuidv4(),
          type: "tool_adhesion",
          title: "Adesione del materiale all'utensile",
          description:
            "L'alluminio tende ad aderire agli utensili, causando cattiva finitura superficiale e riduzione della durata degli utensili",
          solutions: [
            "Utilizzare utensili rivestiti con TiB2 o ALTiN",
            "Impiegare lubrificanti o refrigeranti specifici per alluminio",
            "Aumentare la velocità di taglio per evitare la formazione di bave"
          ],
          severity: "medium"
        });

        issues.push({
          id: uuidv4(),
          type: "burr_formation",
          title: "Formazione di bave",
          description: "Le lavorazioni in alluminio tendono a produrre bave, specialmente sui bordi",
          solutions: [
            "Utilizzare utensili affilati con angoli di spoglia positivi",
            "Aggiungere una passata di finitura leggera per rimuovere le bave",
            "Considerare una leggera smussatura automatica dei bordi nel percorso utensile"
          ],
          severity: "low"
        });
        break;

      case "stainless_steel":
      case "titanium":
        issues.push({
          id: uuidv4(),
          type: "heat_buildup",
          title: "Accumulo di calore",
          description: "Bassa conducibilità termica porta ad accumulo di calore nella zona di taglio",
          solutions: [
            "Utilizzare refrigerazione abbondante, preferibilmente ad alta pressione",
            "Ridurre la velocità di taglio e adattare l'avanzamento",
            "Implementare interruzioni programmate per raffreddamento utensile",
            "Considerare strategie trocoidali per distribuire il calore"
          ],
          severity: "high"
        });

        issues.push({
          id: uuidv4(),
          type: "work_hardening",
          title: "Incrudimento",
          description: "Il materiale tende a indurirsi durante la lavorazione, aumentando la resistenza al taglio",
          solutions: [
            "Mantenere uno spessore di truciolo adeguato (evitare tagli troppo leggeri)",
            "Evitare interruzioni durante il taglio",
            "Utilizzare utensili affilati e sostituirli frequentemente",
            "Preferire strategie che consentano di tagliare sotto la superficie incrudita"
          ],
          severity: "high"
        });

        issues.push({
          id: uuidv4(),
          type: "tool_wear",
          title: "Rapida usura utensile",
          description: "Alta resistenza e abrasività causano rapida usura degli utensili",
          solutions: [
            "Utilizzare utensili di alta qualità con rivestimenti avanzati",
            "Programmare sostituzioni utensile preventive",
            "Ridurre i parametri di taglio per prolungare la vita utensile",
            "Monitorare attivamente l'usura utensile durante la lavorazione"
          ],
          severity: "high"
        });
        break;

      case "plastic":
        issues.push({
          id: uuidv4(),
          type: "melting",
          title: "Fusione del materiale",
          description: "Il calore generato durante la lavorazione può causare la fusione della plastica",
          solutions: [
            "Aumentare la velocità di taglio e l'avanzamento",
            "Utilizzare refrigerazione ad aria compressa",
            "Impiegare utensili specifici per plastiche con geometrie di taglio appropriate",
            "Evitare lunghi periodi di taglio nella stessa area"
          ],
          severity: "high"
        });

        issues.push({
          id: uuidv4(),
          type: "chipping",
          title: "Scheggiatura",
          description: "Alcuni tipi di plastica (specialmente quelle fragili) tendono a scheggiarsi",
          solutions: [
            "Utilizzare utensili molto affilati",
            "Ridurre l'avanzamento sulle uscite dal materiale",
            "Considerare supporti per aree sottili o delicate",
            "Implementare strategie di rampa invece di plunge diretti"
          ],
          severity: "medium"
        });
        break;

      case "wood":
        issues.push({
          id: uuidv4(),
          type: "grain_tearout",
          title: "Strappo delle fibre",
          description: "Il legno tende a strapparsi lungo la direzione delle fibre",
          solutions: [
            "Adattare la direzione di taglio in relazione alle fibre",
            "Utilizzare utensili con geometrie di taglio specifiche per legno",
            "Implementare passate di finitura a velocità elevata e basso avanzamento",
            "Considerare utensili con angoli di spoglia alternativi per prevenire strappi"
          ],
          severity: "medium"
        });

        issues.push({
          id: uuidv4(),
          type: "dust_management",
          title: "Gestione della polvere",
          description: "La lavorazione del legno produce molta polvere fine che può causare problemi",
          solutions: [
            "Implementare un sistema di aspirazione efficiente",
            "Utilizzare utensili con canali di evacuazione specifici",
            "Programmare pause periodiche per pulizia",
            "Considerare tecniche di lavorazione che riducono la produzione di polvere"
          ],
          severity: "medium"
        });
        break;

      case "composite":
        issues.push({
          id: uuidv4(),
          type: "delamination",
          title: "Delaminazione",
          description: "I materiali compositi tendono a delaminarsi durante la lavorazione",
          solutions: [
            "Utilizzare utensili specifici per compositi",
            "Implementare supporti adeguati per prevenire flessioni",
            "Adattare l'orientamento del percorso utensile rispetto alle fibre",
            "Utilizzare fixture a vuoto per migliore supporto"
          ],
          severity: "high"
        });

        issues.push({
          id: uuidv4(),
          type: "fiber_breakout",
          title: "Rottura delle fibre",
          description: "Le fibre possono rompersi e fuoriuscire dalle superfici lavorate",
          solutions: [
            "Utilizzare utensili speciali con geometrie di taglio a controstrato",
            "Implementare strategie di taglio con pressione opposta",
            "Considerare sacrificial backing per supportare l'uscita dell'utensile",
            "Eseguire un'operazione di finitura separata con parametri ottimizzati"
          ],
          severity: "medium"
        });
        break;

      default:
        issues.push({
          id: uuidv4(),
          type: "general",
          title: "Problemi generali di lavorazione",
          description: "Problemi comuni che possono verificarsi nella lavorazione di questo materiale",
          solutions: [
            "Ottimizzare i parametri di taglio in base a test specifici",
            "Utilizzare utensili appropriati per il materiale",
            "Implementare refrigerazione adeguata",
            "Monitorare la qualità durante la lavorazione"
          ],
          severity: "medium"
        });
    }

    // Problemi basati su proprietà specifiche del materiale
    if (material.hardness && material.hardness > 45) {
      issues.push({
        id: uuidv4(),
        type: "high_hardness",
        title: "Elevata durezza",
        description: `La durezza del materiale (${material.hardness}) è elevata e può causare problemi`,
        solutions: [
          "Utilizzare utensili in carburo di tungsteno con rivestimenti avanzati",
          "Ridurre la velocità di taglio e adattare l'avanzamento",
          "Considerare pre-trattamenti termici se possibile",
          "Programmare sostituzioni utensile più frequenti"
        ],
        severity: "high"
      });
    }

    if (material.machinability && material.machinability < 40) {
      issues.push({
        id: uuidv4(),
        type: "low_machinability",
        title: "Bassa lavorabilità",
        description: `L'indice di machinability (${material.machinability}%) è basso, indicando difficoltà di lavorazione`,
        solutions: [
          "Ridurre significativamente i parametri di taglio",
          "Utilizzare utensili di alta qualità con geometrie specifiche",
          "Implementare strategie di lavorazione conservative",
          "Considerare tecnologie alternative se appropriate"
        ],
        severity: "high"
      });
    }

    return issues;
  }

  /**
   * Suggerisce utensili compatibili per un materiale
   */
  private recommendTools(material: Material, availableTools?: Tool[]): any[] {
    const recommendations: any[] = [];

    // Mappatura materiale -> utensile consigliato per tipo
    const recommendedToolMaterials: Record<MaterialType, string[]> = {
      "aluminum": ["Carburo non rivestito", "TiB2", "ZrN", "Diamante policristallino"],
      "steel": ["Carburo rivestito TiN", "Carburo rivestito TiCN", "Carburo rivestito TiAlN", "HSS-Co"],
      "stainless_steel": ["Carburo rivestito AlTiN", "Carburo rivestito TiAlN", "Carburo rivestito ZrN", "Ceramico"],
      "titanium": [
        "Carburo rivestito AlTiN",
        "Carburo rivestito TiAlN",
        "Carburo rivestito TiB2",
        "Carburo non rivestito"
      ],
      "plastic": ["Carburo non rivestito lucido", "Diamante policristallino", "HSS lucidato", "Rivestimento DLC"],
      "wood": ["Carburo non rivestito", "Diamante policristallino", "HSS", "Acciaio al carbonio"],
      "composite": [
        "Diamante policristallino",
        "Carburo rivestito diamante",
        "Carburo rivestito TiAlN",
        "Carburo non rivestito"
      ],
      "brass": ["Carburo non rivestito", "HSS", "Rivestimento TiN", "Carburo micrograno"],
      "copper": ["Carburo non rivestito", "HSS", "Diamante policristallino", "Carburo micrograno"],
      "foam": ["Carburo non rivestito", "HSS", "Acciaio al carbonio", "Lama specifica per schiuma"],
      "custom": ["Verificare con il fornitore del materiale"]
    };

    // Utensili consigliati per tipo di operazione
    const operationTools: Record<string, ToolType[]> = {
      "roughing": ["end_mill", "bull_nose_mill", "face_mill"],
      "finishing": ["ball_mill", "bull_nose_mill", "end_mill"],
      "slotting": ["end_mill"],
      "profiling": ["end_mill", "bull_nose_mill"],
      "drilling": ["drill"],
      "threading": ["tap"],
      "chamfering": ["chamfer_mill", "v_bit"],
      "engraving": ["v_bit"]
    };

    // Raccomandazioni generali per il materiale
    recommendations.push({
      id: uuidv4(),
      type: "material_tools",
      title: `Materiali utensile consigliati per ${material.name}`,
      description: "Materiali utensile ottimali per questo tipo di materiale",
      tools: recommendedToolMaterials[material.type] || recommendedToolMaterials.custom
    });

    // Raccomandazioni per operazioni specifiche
    recommendations.push({
      id: uuidv4(),
      type: "operation_tools",
      title: "Utensili consigliati per operazione",
      description: "Tipi di utensile raccomandati per operazioni comuni",
      operations: [
        {
          name: "Sgrossatura",
          tools: this.formatToolRecommendations(operationTools.roughing, material, availableTools)
        },
        {
          name: "Finitura",
          tools: this.formatToolRecommendations(operationTools.finishing, material, availableTools)
        },
        {
          name: "Scanalatura",
          tools: this.formatToolRecommendations(operationTools.slotting, material, availableTools)
        },
        {
          name: "Profilatura",
          tools: this.formatToolRecommendations(operationTools.profiling, material, availableTools)
        },
        {
          name: "Foratura",
          tools: this.formatToolRecommendations(operationTools.drilling, material, availableTools)
        }
      ]
    });

    // Se sono disponibili utensili specifici, fai raccomandazioni personalizzate
    if (availableTools && availableTools.length > 0) {
      const compatibleTools = this.findCompatibleTools(material, availableTools);

      recommendations.push({
        id: uuidv4(),
        type: "available_tools",
        title: "Utensili disponibili compatibili",
        description: `Utensili disponibili compatibili con ${material.name}`,
        tools: compatibleTools.map(tool => ({
          id: tool.id,
          name: tool.name,
          type: tool.type,
          diameter: tool.diameter,
          compatibility: this.calculateToolCompatibility(tool, material)
        }))
      });
    }

    return recommendations;
  }

  /**
   * Formatta le raccomandazioni per utensili in base al tipo
   */
  private formatToolRecommendations(toolTypes: ToolType[], material: Material, availableTools?: Tool[]): any[] {
    const result: any[] = [];

    for (const type of toolTypes) {
      const rec: any = {
        type,
        attributes: []
      };

      // Aggiungi attributi consigliati in base al materiale
      switch (material.type) {
        case "aluminum":
          rec.attributes.push("Geometria tagliente positiva");
          rec.attributes.push("2-3 taglienti (frese)");
          rec.attributes.push("Canali di evacuazione ampi");
          break;

        case "stainless_steel":
        case "titanium":
          rec.attributes.push("Geometria tagliente leggermente positiva");
          rec.attributes.push("Più taglienti per distribuire il carico");
          rec.attributes.push("Nucleo robusto");
          break;

        case "plastic":
          rec.attributes.push("Geometria tagliente molto positiva");
          rec.attributes.push("1-2 taglienti (frese)");
          rec.attributes.push("Superficie lucida");
          break;
      }

      // Se disponibili utensili, trova quelli compatibili di questo tipo
      if (availableTools) {
        const compatibleTools = availableTools.filter(
          tool => tool.type === type && this.calculateToolCompatibility(tool, material) >= 0.7
        );

        if (compatibleTools.length > 0) {
          rec.recommendedTools = compatibleTools.map(tool => ({
            id: tool.id,
            name: tool.name,
            diameter: tool.diameter,
            compatibility: this.calculateToolCompatibility(tool, material)
          }));
        }
      }

      result.push(rec);
    }

    return result;
  }

  /**
   * Trova utensili compatibili con un materiale
   */
  private findCompatibleTools(material: Material, tools: Tool[]): Tool[] {
    return tools.filter(tool => this.calculateToolCompatibility(tool, material) >= 0.6);
  }

  /**
   * Calcola la compatibilità tra utensile e materiale (0-1)
   */
  private calculateToolCompatibility(tool: Tool, material: Material): number {
    let score = 0.5; // Punteggio base

    // Verifica se il materiale è tra quelli raccomandati per l'utensile
    if (tool.recommendedMaterials && tool.recommendedMaterials.includes(material.type)) {
      score += 0.3;
    }

    // Verifica il materiale dell'utensile
    if (tool.material) {
      const idealToolMaterials = {
        "aluminum": ["carburo non rivestito", "hss", "diamante", "tib2", "zrn"],
        "steel": ["carburo rivestito", "tin", "ticn", "tialn", "hss-co"],
        "stainless_steel": ["carburo rivestito", "altin", "tialn", "zrn", "ceramico"],
        "titanium": ["carburo rivestito", "altin", "tialn", "tib2"],
        "plastic": ["carburo non rivestito", "diamante", "hss", "dlc"],
        "wood": ["carburo", "diamante", "hss", "acciaio"],
        "composite": ["diamante", "carburo rivestito diamante", "tialn"]
      };

      const toolMaterialLower = tool.material.toLowerCase();

      // Controlla se il materiale dell'utensile è tra quelli ideali per questo materiale
      const idealMaterials = idealToolMaterials[material.type as keyof typeof idealToolMaterials] || [];

      for (const idealMaterial of idealMaterials) {
        if (toolMaterialLower.includes(idealMaterial)) {
          score += 0.2;
          break;
        }
      }
    }

    // Verifica il rivestimento
    if (tool.coating) {
      const idealCoatings = {
        "aluminum": ["tib2", "zrn", "diamante", "non rivestito"],
        "steel": ["tin", "ticn", "tialn", "altin"],
        "stainless_steel": ["altin", "tialn", "zrn", "ticn"],
        "titanium": ["altin", "tialn", "tib2"],
        "plastic": ["dlc", "non rivestito", "diamante"],
        "wood": ["non rivestito", "diamante"],
        "composite": ["diamante", "tialn", "altin"]
      };

      const coatingLower = tool.coating.toLowerCase();

      // Controlla se il rivestimento è tra quelli ideali per questo materiale
      const idealCoatingList = idealCoatings[material.type as keyof typeof idealCoatings] || [];

      for (const idealCoating of idealCoatingList) {
        if (coatingLower.includes(idealCoating)) {
          score += 0.2;
          break;
        }
      }
    }

    // Limita il punteggio tra 0 e 1
    return Math.max(0, Math.min(1, score));
  }
}

// Esporta un'istanza singleton
export const materialAnalyzer = new MaterialAnalyzer();

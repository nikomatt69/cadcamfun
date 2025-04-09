// src/lib/materialProperties.ts
/**
 * Database delle proprietà dei materiali per la visualizzazione nell'anteprima
 * Contiene informazioni dettagliate sui materiali utilizzati nelle lavorazioni CNC
 */

export interface MaterialPropertyDetail {
    density: string;
    hardness: string;
    thermalBehavior: string;
    chipType: string;
    coolant: string;
    recommendedToolCoating?: string;
    machinability?: string;
    feedrateModifier?: number;
    speedModifier?: number;
  }
  
  export const materialProperties: Record<string, MaterialPropertyDetail> = {
    aluminum: {
      density: "2.7 g/cm³",
      hardness: "Medio-bassa",
      thermalBehavior: "Alta conducibilità termica",
      chipType: "Trucioli lunghi e continui",
      coolant: "Raccomandato",
      recommendedToolCoating: "TiAlN, AlTiN",
      machinability: "Eccellente",
      feedrateModifier: 1.0,
      speedModifier: 1.0
    },
    steel: {
      density: "7.85 g/cm³",
      hardness: "Media-alta",
      thermalBehavior: "Conducibilità termica media",
      chipType: "Trucioli a nastro o segmentati",
      coolant: "Necessario",
      recommendedToolCoating: "TiCN, AlTiN",
      machinability: "Buona",
      feedrateModifier: 0.6,
      speedModifier: 0.5
    },
    wood: {
      density: "0.4-1.2 g/cm³",
      hardness: "Variabile",
      thermalBehavior: "Bassa conducibilità termica",
      chipType: "Trucioli fibrosi",
      coolant: "Non necessario",
      recommendedToolCoating: "Non richiesto",
      machinability: "Eccellente",
      feedrateModifier: 1.2,
      speedModifier: 1.2
    },
    plastic: {
      density: "0.9-2.2 g/cm³",
      hardness: "Bassa",
      thermalBehavior: "Sensibile al calore",
      chipType: "Trucioli fusi o arricciati",
      coolant: "Aria compressa",
      recommendedToolCoating: "Non richiesto",
      machinability: "Buona",
      feedrateModifier: 0.8,
      speedModifier: 0.9
    },
    brass: {
      density: "8.4-8.7 g/cm³",
      hardness: "Media",
      thermalBehavior: "Alta conducibilità termica",
      chipType: "Trucioli corti",
      coolant: "Raccomandato",
      recommendedToolCoating: "TiN",
      machinability: "Eccellente",
      feedrateModifier: 1.0,
      speedModifier: 0.8
    },
    titanium: {
      density: "4.5 g/cm³",
      hardness: "Alta",
      thermalBehavior: "Bassa conducibilità termica",
      chipType: "Trucioli segmentati",
      coolant: "Necessario ad alta pressione",
      recommendedToolCoating: "AlTiN, TiAlN",
      machinability: "Difficile",
      feedrateModifier: 0.3,
      speedModifier: 0.2
    },
    composite: {
      density: "1.0-2.0 g/cm³",
      hardness: "Variabile",
      thermalBehavior: "Bassa conducibilità termica",
      chipType: "Trucioli abrasivi",
      coolant: "Raccomandato",
      recommendedToolCoating: "Diamante",
      machinability: "Moderata",
      feedrateModifier: 0.7,
      speedModifier: 0.6
    },
    other: {
      density: "Variabile",
      hardness: "Variabile",
      thermalBehavior: "Variabile",
      chipType: "Variabile",
      coolant: "Consultare specifiche",
      machinability: "Variabile"
    }
  };
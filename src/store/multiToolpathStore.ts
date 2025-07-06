import { create } from "zustand";
import { persist } from "zustand/middleware";
import { ToolpathSettings } from "../components/cam/ToolpathGenerator";

// Interfaccia per un singolo toolpath associato a un elemento
export interface ElementToolpath {
  id: string; // ID univoco del toolpath
  elementId: string; // ID dell'elemento CAD
  elementType: string; // Tipo di elemento (rectangle, circle, etc.)
  elementName: string; // Nome descrittivo
  toolpathSettings: ToolpathSettings; // Impostazioni specifiche per questo toolpath
  gcode: string; // G-code generato
  color: string; // Colore per visualizzazione (hex)
  visible: boolean; // Visibilità nel visualizzatore
  toolpathPoints: ToolpathPoint[]; // Punti del percorso
  selected: boolean; // Se è selezionato nell'UI
  order: number; // Ordine di esecuzione
  estimatedTime: number; // Tempo stimato in secondi
  distance: number; // Distanza totale percorso
}

// Interfaccia per i punti del toolpath
export interface ToolpathPoint {
  x: number;
  y: number;
  z: number;
  feedrate?: number;
  type?: string;
  isRapid?: boolean;
  isArc?: boolean;
  elementId?: string; // Riferimento all'elemento
}

// Colori predefiniti per i toolpath
export const TOOLPATH_COLORS = [
  "#FF6B6B", // Rosso
  "#4ECDC4", // Turchese
  "#45B7D1", // Blu
  "#96CEB4", // Verde
  "#FECA57", // Giallo
  "#DDA0DD", // Viola
  "#98D8C8", // Menta
  "#FFB6C1", // Rosa
  "#FFA07A", // Salmone
  "#87CEEB" // Azzurro cielo
];

interface MultiToolpathState {
  // Stato
  toolpaths: ElementToolpath[];
  selectedToolpathIds: string[];
  activeToolpathId: string | null;
  globalSettings: Partial<ToolpathSettings>; // Impostazioni globali di default

  // Azioni
  addToolpath: (elementId: string, elementType: string, elementName: string, settings: ToolpathSettings) => string;
  updateToolpath: (id: string, updates: Partial<ElementToolpath>) => void;
  removeToolpath: (id: string) => void;
  removeToolpathByElementId: (elementId: string) => void;

  // Selezione
  selectToolpath: (id: string) => void;
  deselectToolpath: (id: string) => void;
  selectAllToolpaths: () => void;
  deselectAllToolpaths: () => void;

  // Visibilità
  toggleToolpathVisibility: (id: string) => void;
  showAllToolpaths: () => void;
  hideAllToolpaths: () => void;

  // G-code e punti
  updateToolpathGCode: (id: string, gcode: string, points: ToolpathPoint[]) => void;

  // Ordinamento
  reorderToolpaths: (newOrder: string[]) => void;
  moveToolpathUp: (id: string) => void;
  moveToolpathDown: (id: string) => void;

  // Utilità
  getToolpathByElementId: (elementId: string) => ElementToolpath | undefined;
  getToolpathById: (id: string) => ElementToolpath | undefined;
  getVisibleToolpaths: () => ElementToolpath[];
  getSelectedToolpaths: () => ElementToolpath[];
  generateCombinedGCode: () => string;

  // Reset
  clearAllToolpaths: () => void;

  // Impostazioni globali
  updateGlobalSettings: (settings: Partial<ToolpathSettings>) => void;
  applyGlobalSettingsToSelected: () => void;
}

export const useMultiToolpathStore = create<MultiToolpathState>()(
  persist(
    (set, get) => ({
      // Stato iniziale
      toolpaths: [],
      selectedToolpathIds: [],
      activeToolpathId: null,
      globalSettings: {
        feedrate: 800,
        plungerate: 300,
        rpm: 10000,
        depth: 5,
        stepdown: 1,
        stepover: 40,
        toolDiameter: 6,
        offset: "outside",
        direction: "climb"
      },

      // Aggiunge un nuovo toolpath
      addToolpath: (elementId, elementType, elementName, settings) => {
        const id = `toolpath-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const colorIndex = get().toolpaths.length % TOOLPATH_COLORS.length;

        set(state => ({
          toolpaths: [
            ...state.toolpaths,
            {
              id,
              elementId,
              elementType,
              elementName,
              toolpathSettings: settings,
              gcode: "",
              color: TOOLPATH_COLORS[colorIndex],
              visible: true,
              toolpathPoints: [],
              selected: false,
              order: state.toolpaths.length,
              estimatedTime: 0,
              distance: 0
            }
          ]
        }));

        return id;
      },

      // Aggiorna un toolpath esistente
      updateToolpath: (id, updates) => {
        set(state => ({
          toolpaths: state.toolpaths.map(tp => (tp.id === id ? { ...tp, ...updates } : tp))
        }));
      },

      // Rimuove un toolpath
      removeToolpath: id => {
        set(state => ({
          toolpaths: state.toolpaths.filter(tp => tp.id !== id),
          selectedToolpathIds: state.selectedToolpathIds.filter(tpId => tpId !== id),
          activeToolpathId: state.activeToolpathId === id ? null : state.activeToolpathId
        }));
      },

      // Rimuove toolpath per elemento ID
      removeToolpathByElementId: elementId => {
        set(state => {
          const toolpathsToRemove = state.toolpaths.filter(tp => tp.elementId === elementId);
          const idsToRemove = toolpathsToRemove.map(tp => tp.id);

          return {
            toolpaths: state.toolpaths.filter(tp => tp.elementId !== elementId),
            selectedToolpathIds: state.selectedToolpathIds.filter(id => !idsToRemove.includes(id)),
            activeToolpathId: idsToRemove.includes(state.activeToolpathId || "") ? null : state.activeToolpathId
          };
        });
      },

      // Seleziona un toolpath
      selectToolpath: id => {
        set(state => ({
          toolpaths: state.toolpaths.map(tp => (tp.id === id ? { ...tp, selected: true } : tp)),
          selectedToolpathIds: state.selectedToolpathIds.includes(id)
            ? state.selectedToolpathIds
            : [...state.selectedToolpathIds, id],
          activeToolpathId: id
        }));
      },

      // Deseleziona un toolpath
      deselectToolpath: id => {
        set(state => ({
          toolpaths: state.toolpaths.map(tp => (tp.id === id ? { ...tp, selected: false } : tp)),
          selectedToolpathIds: state.selectedToolpathIds.filter(tpId => tpId !== id),
          activeToolpathId: state.activeToolpathId === id ? null : state.activeToolpathId
        }));
      },

      // Seleziona tutti
      selectAllToolpaths: () => {
        set(state => ({
          toolpaths: state.toolpaths.map(tp => ({ ...tp, selected: true })),
          selectedToolpathIds: state.toolpaths.map(tp => tp.id)
        }));
      },

      // Deseleziona tutti
      deselectAllToolpaths: () => {
        set(() => ({
          toolpaths: get().toolpaths.map(tp => ({ ...tp, selected: false })),
          selectedToolpathIds: [],
          activeToolpathId: null
        }));
      },

      // Toggle visibilità
      toggleToolpathVisibility: id => {
        set(state => ({
          toolpaths: state.toolpaths.map(tp => (tp.id === id ? { ...tp, visible: !tp.visible } : tp))
        }));
      },

      // Mostra tutti
      showAllToolpaths: () => {
        set(state => ({
          toolpaths: state.toolpaths.map(tp => ({ ...tp, visible: true }))
        }));
      },

      // Nascondi tutti
      hideAllToolpaths: () => {
        set(state => ({
          toolpaths: state.toolpaths.map(tp => ({ ...tp, visible: false }))
        }));
      },

      // Aggiorna G-code e punti
      updateToolpathGCode: (id, gcode, points) => {
        // Calcola tempo stimato e distanza
        let totalDistance = 0;
        let totalTime = 0;

        for (let i = 1; i < points.length; i++) {
          const p1 = points[i - 1];
          const p2 = points[i];
          const distance = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2) + Math.pow(p2.z - p1.z, 2));
          totalDistance += distance;

          // Stima tempo basata su feedrate
          if (p2.feedrate && p2.feedrate > 0) {
            totalTime += (distance / p2.feedrate) * 60; // converti da mm/min a secondi
          }
        }

        set(state => ({
          toolpaths: state.toolpaths.map(tp =>
            tp.id === id
              ? {
                  ...tp,
                  gcode,
                  toolpathPoints: points.map(p => ({ ...p, elementId: tp.elementId })),
                  estimatedTime: totalTime,
                  distance: totalDistance
                }
              : tp
          )
        }));
      },

      // Riordina toolpaths
      reorderToolpaths: newOrder => {
        set(state => ({
          toolpaths: state.toolpaths
            .map(tp => ({
              ...tp,
              order: newOrder.indexOf(tp.id)
            }))
            .sort((a, b) => a.order - b.order)
        }));
      },

      // Sposta su
      moveToolpathUp: id => {
        const toolpaths = [...get().toolpaths];
        const index = toolpaths.findIndex(tp => tp.id === id);

        if (index > 0) {
          [toolpaths[index], toolpaths[index - 1]] = [toolpaths[index - 1], toolpaths[index]];
          toolpaths.forEach((tp, i) => (tp.order = i));
          set({ toolpaths });
        }
      },

      // Sposta giù
      moveToolpathDown: id => {
        const toolpaths = [...get().toolpaths];
        const index = toolpaths.findIndex(tp => tp.id === id);

        if (index < toolpaths.length - 1) {
          [toolpaths[index], toolpaths[index + 1]] = [toolpaths[index + 1], toolpaths[index]];
          toolpaths.forEach((tp, i) => (tp.order = i));
          set({ toolpaths });
        }
      },

      // Ottieni toolpath per elemento ID
      getToolpathByElementId: elementId => {
        return get().toolpaths.find(tp => tp.elementId === elementId);
      },

      // Ottieni toolpath per ID
      getToolpathById: id => {
        return get().toolpaths.find(tp => tp.id === id);
      },

      // Ottieni toolpaths visibili
      getVisibleToolpaths: () => {
        return get().toolpaths.filter(tp => tp.visible);
      },

      // Ottieni toolpaths selezionati
      getSelectedToolpaths: () => {
        return get().toolpaths.filter(tp => tp.selected);
      },

      // Genera G-code combinato
      generateCombinedGCode: () => {
        const toolpaths = get().toolpaths.sort((a, b) => a.order - b.order);
        let combinedGCode = "; Combined G-Code from Multiple Toolpaths\n";
        combinedGCode += `; Generated: ${new Date().toISOString()}\n`;
        combinedGCode += `; Total toolpaths: ${toolpaths.length}\n\n`;

        toolpaths.forEach((tp, index) => {
          if (tp.gcode) {
            combinedGCode += `\n; ===== Toolpath ${index + 1}: ${tp.elementName} =====\n`;
            combinedGCode += `; Element Type: ${tp.elementType}\n`;
            combinedGCode += `; Tool: Ø${tp.toolpathSettings.toolDiameter}mm\n`;
            combinedGCode += `; Color: ${tp.color}\n\n`;
            combinedGCode += tp.gcode;
            combinedGCode += "\n";
          }
        });

        combinedGCode += "\n; ===== End of Combined G-Code =====\n";
        return combinedGCode;
      },

      // Pulisci tutti i toolpaths
      clearAllToolpaths: () => {
        set({
          toolpaths: [],
          selectedToolpathIds: [],
          activeToolpathId: null
        });
      },

      // Aggiorna impostazioni globali
      updateGlobalSettings: settings => {
        set(state => ({
          globalSettings: { ...state.globalSettings, ...settings }
        }));
      },

      // Applica impostazioni globali ai selezionati
      applyGlobalSettingsToSelected: () => {
        const { globalSettings, selectedToolpathIds } = get();

        set(state => ({
          toolpaths: state.toolpaths.map(tp =>
            selectedToolpathIds.includes(tp.id)
              ? {
                  ...tp,
                  toolpathSettings: { ...tp.toolpathSettings, ...globalSettings }
                }
              : tp
          )
        }));
      }
    }),
    {
      name: "multi-toolpath-storage",
      partialize: state => ({
        toolpaths: state.toolpaths,
        globalSettings: state.globalSettings
      })
    }
  )
);

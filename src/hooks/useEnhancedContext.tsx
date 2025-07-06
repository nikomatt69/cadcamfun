import React, { useEffect, useState } from "react";
import { useElementsStore } from "@/src/store/elementsStore";
import { useContextStore } from "@/src/store/contextStore";

interface ContextSummary {
  elements: {
    count: number;
    types: Record<string, number>;
    summary: string;
  };
  documents: {
    count: number;
    summary: string;
  };
  history: {
    count: number;
    recentActions: string[];
  };
  environment: {
    browser: string;
    screen: string;
    os: string;
  };
}

export const useEnhancedContext = () => {
  const [contextSummary, setContextSummary] = useState<ContextSummary | null>(null);
  const { elements } = useElementsStore();
  const { contextFiles, activeContextIds } = useContextStore();

  // Costruisci un contesto arricchito in base agli elementi presenti e ai file di contesto
  useEffect(() => {
    const typeCounts: Record<string, number> = {};
    elements.forEach(el => {
      typeCounts[el.type] = (typeCounts[el.type] || 0) + 1;
    });

    const activeFiles = contextFiles.filter(file => activeContextIds.includes(file.id));

    const elementSummary =
      elements.length > 0
        ? `La scena contiene ${elements.length} elementi, principalmente ${Object.entries(typeCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([type, count]) => `${count} ${type}`)
            .join(", ")}`
        : "Nessun elemento presente nella scena";

    const documentSummary =
      activeFiles.length > 0
        ? `${activeFiles.length} file di contesto attivi: ${activeFiles.map(file => file.name).join(", ")}`
        : "Nessun file di contesto attivo";

    // Informazioni sul browser
    const userAgent = navigator.userAgent;
    const browserInfo = userAgent.match(/(chrome|safari|firefox|msie|trident|edge)\/([\d.]+)/i);
    const browserName = browserInfo ? browserInfo[1] : "unknown";
    const browserVersion = browserInfo ? browserInfo[2] : "unknown";

    setContextSummary({
      elements: {
        count: elements.length,
        types: typeCounts,
        summary: elementSummary
      },
      documents: {
        count: activeFiles.length,
        summary: documentSummary
      },
      history: {
        count: 0, // Da implementare con la history delle azioni
        recentActions: [] // Da implementare
      },
      environment: {
        browser: `${browserName} ${browserVersion}`,
        screen: `${window.innerWidth}x${window.innerHeight}`,
        os: navigator.platform
      }
    });
  }, [elements, contextFiles, activeContextIds]);

  // Funzione per generare una descrizione testuale del contesto
  const getContextDescription = (): string => {
    if (!contextSummary) return "";

    return `
      Contesto CAD:
      - ${contextSummary.elements.summary}
      - ${contextSummary.documents.summary}
      
      Sistema:
      - ${contextSummary.environment.browser}, ${contextSummary.environment.screen}, ${contextSummary.environment.os}
    `;
  };

  // Funzione per generare la rappresentazione strutturata del contesto
  const getStructuredContext = (): Record<string, any> => {
    if (!contextSummary) return {};

    return {
      elements: {
        count: contextSummary.elements.count,
        types: contextSummary.elements.types,
        details: elements.map(el => ({
          id: el.id,
          type: el.type,
          name: el.name || null,
          position: { x: el.x, y: el.y, z: el.z || 0 },
          dimensions:
            el.width || el.radius
              ? {
                  width: el.width || el.radius * 2 || null,
                  height: el.height || el.radius * 2 || null,
                  depth: el.depth || null
                }
              : null,
          color: el.color || null
        }))
      },
      documents: {
        count: contextSummary.documents.count,
        files: contextFiles
          .filter(file => activeContextIds.includes(file.id))
          .map(file => ({
            name: file.name,
            type: file.name.split(".").pop() || "unknown",
            size: file.size
          }))
      },
      environment: contextSummary.environment
    };
  };

  return {
    contextSummary,
    getContextDescription,
    getStructuredContext
  };
};

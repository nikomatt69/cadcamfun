import { useEffect, useState } from "react";
import { useContextStore } from "@/src/store/contextStore";

interface DocumentInsight {
  key: string;
  value: string;
  confidence: number;
}

export const useDocumentAnalyzer = () => {
  const { contextFiles, activeContextIds } = useContextStore();
  const [documentInsights, setDocumentInsights] = useState<DocumentInsight[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Funzione per estrarre insights dai documenti
  const analyzeDocuments = async () => {
    const activeFiles = contextFiles.filter(file => activeContextIds.includes(file.id));

    if (activeFiles.length === 0) {
      setDocumentInsights([]);
      return;
    }

    setIsAnalyzing(true);

    // Pattern matching semplificato per estrarre insights
    // In una implementazione reale, questo utilizzerebbe NLP o un servizio AI
    const extractedInsights: DocumentInsight[] = [];

    for (const file of activeFiles) {
      const content = file.content || "";

      // Pattern per dimensioni
      const dimensionMatches = content.match(/\b(\d+(?:\.\d+)?)\s*(mm|cm|m|in|inch|foot|ft)\b/g);
      if (dimensionMatches && dimensionMatches.length > 0) {
        extractedInsights.push({
          key: "dimensions",
          value: dimensionMatches.slice(0, 3).join(", "),
          confidence: 0.8
        });
      }

      // Pattern per materiali
      const materialKeywords = ["steel", "aluminum", "plastic", "wood", "concrete", "glass"];
      for (const material of materialKeywords) {
        if (content.toLowerCase().includes(material)) {
          extractedInsights.push({
            key: "material",
            value: material,
            confidence: 0.7
          });
        }
      }

      // Pattern per colori
      const colorKeywords = ["red", "blue", "green", "yellow", "black", "white"];
      for (const color of colorKeywords) {
        if (content.toLowerCase().includes(color)) {
          extractedInsights.push({
            key: "color",
            value: color,
            confidence: 0.6
          });
        }
      }
    }

    setDocumentInsights(extractedInsights);
    setIsAnalyzing(false);
  };

  useEffect(() => {
    analyzeDocuments();
  }, [contextFiles, activeContextIds]);

  return {
    documentInsights,
    isAnalyzing,
    refreshAnalysis: analyzeDocuments
  };
};

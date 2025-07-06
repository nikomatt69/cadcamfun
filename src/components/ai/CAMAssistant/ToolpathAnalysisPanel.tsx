// src/components/ai/CAMAssistant/ToolpathAnalysisPanel.tsx
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useCAMAssistant } from "./CAMAssistantBridge";
import { Toolpath, ToolpathAnalysis, ToolpathIssue, ToolpathRecommendation } from "../../../types/CAMTypes";
import { Button } from "../../ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../../ui/Card";
import { Progress } from "../../ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../ui/Tabs";
import { Badge } from "../../ui/badge";
import { AlertCircle, CheckCircle2, ChevronRight, AlertTriangle, Info, FileText, Settings } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../../ui/accordion";
import { ScrollArea } from "../../ui/scroll-area";
import { Separator } from "../../ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { useCAMStore } from "../../../store/camStore";

/**
 * Proprietà del componente ToolpathAnalysisPanel
 */
interface ToolpathAnalysisPanelProps {
  toolpath?: Toolpath;
  analysis?: ToolpathAnalysis;
  onAnalyze?: (toolpath: Toolpath) => Promise<ToolpathAnalysis | null>;
  onOptimize?: (toolpath: Toolpath, goals: ("time" | "quality" | "tool_life" | "cost")[]) => Promise<Toolpath | null>;
  className?: string;
}

/**
 * Componente per visualizzare l'analisi di un percorso utensile
 */
export const ToolpathAnalysisPanel: React.FC<ToolpathAnalysisPanelProps> = ({
  toolpath: externalToolpath,
  analysis: externalAnalysis,
  onAnalyze,
  onOptimize,
  className = ""
}) => {
  // Stati
  const [activeTab, setActiveTab] = useState("overview");
  const [analysis, setAnalysis] = useState<ToolpathAnalysis | null>(externalAnalysis || null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizationGoals, setOptimizationGoals] = useState<("time" | "quality" | "tool_life" | "cost")[]>([
    "time",
    "quality"
  ]);

  // Context e Store
  const camAssistant = useCAMAssistant();
  const camStore = useCAMStore();

  // Ottiene il toolpath attivo dal camStore
  const activeToolpathFromStore = useMemo(() => {
    // Logging per debug
    console.log("CAM Store toolpaths:", camStore.toolpaths);
    console.log("CAM Store selectedEntities:", camStore.selectedEntities);

    // Controlla se c'è un gcode generato recentemente nello store
    const generatedGcode = camStore.gcode || camStore.preserveGeometry;
    if (generatedGcode) {
      console.log("Found generated G-code in store:", generatedGcode);
      return generatedGcode as unknown as Toolpath;
    }

    // Se ci sono toolpaths selezionati nello store, prendi il primo
    if (camStore.selectedEntities.length > 0) {
      // Trova un toolpath che corrisponde a un'entità selezionata
      const selectedToolpathId = camStore.selectedEntities[0];
      const foundToolpath = camStore.toolpaths.find(tp => tp.id === selectedToolpathId);
      console.log("Found selected toolpath:", foundToolpath);
      return foundToolpath;
    }

    // Altrimenti prendi il primo toolpath disponibile
    const firstToolpath = camStore.toolpaths.length > 0 ? camStore.toolpaths[0] : undefined;
    console.log("Using first toolpath:", firstToolpath);
    return firstToolpath;
  }, [camStore.toolpaths, camStore.selectedEntities, camStore.gcode, camStore.preserveGeometry]);

  // Funzione per adattare il formato del toolpath dallo store CAM al formato richiesto
  const adaptToolpathFromStore = useCallback(
    (storeToolpath: any): Toolpath | undefined => {
      if (!storeToolpath) return undefined;

      // Se è un G-code generato, controlla se contiene un toolpath
      if (storeToolpath.gcode || storeToolpath.gcodeContent) {
        console.log("Adapting from generated G-code:", storeToolpath);

        // Gestione diretta del G-code
        return {
          id: storeToolpath.id || `gcode-${Date.now()}`,
          name: storeToolpath.name || "G-code Toolpath",
          points: storeToolpath.points || [{ x: 0, y: 0, z: 0 }],
          operation: storeToolpath.operation || { type: "milling", feedRate: 1000 },
          toolId: storeToolpath.toolId || "default",
          estimatedTime: storeToolpath.estimatedTime,
          estimatedCost: storeToolpath.estimatedCost,
          metadata: {
            ...storeToolpath.metadata,
            fromGcode: true,
            timestamp: Date.now()
          }
        };
      }

      // Gestione per il G-code nello store
      if (storeToolpath === camStore.gcode) {
        console.log("Using G-code directly from store");
        return storeToolpath as unknown as Toolpath;
      }

      // Controlla se il toolpath ha già la struttura richiesta
      if (storeToolpath.points && storeToolpath.operation) {
        return storeToolpath as Toolpath;
      }

      // Adatta il toolpath dal formato dello store al formato richiesto
      try {
        // Cerca i punti e le operazioni nei campi annidati
        let points = [];
        let operation = null;

        // Se il toolpath ha un campo operations, estrarre i dati
        if (storeToolpath.operations && storeToolpath.operations.length > 0) {
          operation = storeToolpath.operations[0];
        }

        // Se il toolpath ha un campo parameters, cercare operazioni lì
        if (storeToolpath.parameters) {
          if (storeToolpath.parameters.operation) {
            operation = storeToolpath.parameters.operation;
          }
          if (storeToolpath.parameters.points) {
            points = storeToolpath.parameters.points;
          }
        }

        // Cerca anche nei campi gcode se presenti
        if (storeToolpath.gcode && storeToolpath.gcode.toolpathData) {
          points = storeToolpath.gcode.toolpathData.points || points;
          operation = storeToolpath.gcode.toolpathData.operation || operation;
        }

        // Costruisci un oggetto Toolpath adattato
        const adaptedToolpath: Toolpath = {
          id: storeToolpath.id,
          name: storeToolpath.name,
          points: points.length > 0 ? points : [{ x: 0, y: 0, z: 0 }], // Punti di default se non trovati
          operation: operation || { type: "unknown", feedRate: 1000 },
          toolId: storeToolpath.toolId || "default",
          estimatedTime: storeToolpath?.estimatedTime,
          estimatedCost: storeToolpath?.estimatedCost,
          metadata: {
            ...storeToolpath?.metadata,
            source: "adapted"
          }
        };

        console.log("Adapted toolpath:", adaptedToolpath);
        return adaptedToolpath;
      } catch (error) {
        console.error("Error adapting toolpath:", error);
        return undefined;
      }
    },
    [camStore.gcode]
  );

  // Seleziona il toolpath, dando priorità a: 1) props esterni, 2) camStore attivo, 3) camAssistant
  const [selectedToolpath, setSelectedToolpath] = useState<Toolpath | undefined>(undefined);

  // Effetto per aggiornare il percorso all'inizializzazione e quando cambiano le fonti
  useEffect(() => {
    console.log("Updating toolpath sources:", {
      externalToolpath,
      activeToolpathFromStore,
      storeGcode: camStore.gcode,
      preserveGeometry: camStore.preserveGeometry,
      camAssistantToolpath: camAssistant.state.activeToolpath
    });

    // Verifica se c'è un G-code direttamente nello store
    if (camStore.gcode) {
      console.log("Using G-code directly from store");
      setSelectedToolpath(camStore.gcode as unknown as Toolpath);
      return;
    }

    const adaptedStoreToolpath = adaptToolpathFromStore(activeToolpathFromStore);

    const toolpathToUse = externalToolpath || adaptedStoreToolpath || camAssistant.state.activeToolpath;

    console.log("Selected toolpath to use:", toolpathToUse);
    setSelectedToolpath(toolpathToUse);
  }, [
    externalToolpath,
    activeToolpathFromStore,
    camAssistant.state.activeToolpath,
    adaptToolpathFromStore,
    camStore.gcode,
    camStore.preserveGeometry
  ]);

  // Gestisce l'analisi del percorso
  const handleAnalyze = useCallback(async () => {
    if (!selectedToolpath) return;

    setIsAnalyzing(true);

    try {
      const result = onAnalyze
        ? await onAnalyze(selectedToolpath)
        : await camAssistant.analyzeToolpath(
            selectedToolpath,
            camAssistant.state.activeTool,
            camAssistant.state.activeMaterial
          );

      if (result) {
        setAnalysis(result);
      }
    } catch (error) {
      console.error("Error analyzing toolpath:", error);
    } finally {
      setIsAnalyzing(false);
    }
  }, [selectedToolpath, onAnalyze, camAssistant]);

  // Effetto per aggiornare l'analisi quando cambia dall'esterno
  useEffect(() => {
    if (externalAnalysis) {
      setAnalysis(externalAnalysis);
    }
  }, [externalAnalysis]);

  // Esegue automaticamente l'analisi quando cambia il toolpath selezionato
  useEffect(() => {
    if (selectedToolpath && !analysis) {
      // Esegui l'analisi automaticamente solo se c'è un toolpath ma non abbiamo ancora un'analisi
      handleAnalyze();
    }
  }, [selectedToolpath, analysis, handleAnalyze]);

  // Gestisce l'ottimizzazione del percorso
  const handleOptimize = useCallback(async () => {
    if (!selectedToolpath) return;

    setIsOptimizing(true);

    try {
      const result = onOptimize
        ? await onOptimize(selectedToolpath, optimizationGoals)
        : await camAssistant.optimizeToolpath(
            selectedToolpath,
            optimizationGoals,
            camAssistant.state.activeTool,
            camAssistant.state.activeMaterial
          );

      if (result) {
        // Analizza il nuovo percorso ottimizzato
        const newAnalysis = await camAssistant.analyzeToolpath(
          result,
          camAssistant.state.activeTool,
          camAssistant.state.activeMaterial
        );

        if (newAnalysis) {
          setAnalysis(newAnalysis);
        }
      }
    } catch (error) {
      console.error("Error optimizing toolpath:", error);
    } finally {
      setIsOptimizing(false);
    }
  }, [selectedToolpath, optimizationGoals, onOptimize, camAssistant]);

  // Gestisce la selezione del percorso
  const handleToolpathChange = useCallback(
    (id: string) => {
      console.log("Changing toolpath to ID:", id);

      // Verifica se è il gcode dallo store
      if (camStore.gcode && camStore.gcode === id) {
        console.log("Selected G-code from store");
        setSelectedToolpath(camStore.gcode as unknown as Toolpath);
        setAnalysis(null);
        return;
      }

      // Prima controlla nel camStore
      const toolpathFromStore = camStore.toolpaths.find(t => t.id === id);
      if (toolpathFromStore) {
        console.log("Found toolpath in camStore:", toolpathFromStore);
        const adaptedToolpath = adaptToolpathFromStore(toolpathFromStore);
        if (adaptedToolpath) {
          setSelectedToolpath(adaptedToolpath);
          setAnalysis(null);
          return;
        } else {
          console.error("Failed to adapt toolpath from store");
        }
      }

      // Se non trovato nel camStore, cerca nel camAssistant
      const toolpath = camAssistant.state.toolpaths.find(t => t.id === id);
      if (toolpath) {
        console.log("Found toolpath in camAssistant:", toolpath);
        setSelectedToolpath(toolpath);
        setAnalysis(null);
      } else {
        console.error("Toolpath not found in any source");
      }
    },
    [camStore.toolpaths, camAssistant.state.toolpaths, adaptToolpathFromStore, camStore.gcode]
  );

  // Gestisce la selezione degli obiettivi di ottimizzazione
  const handleGoalToggle = useCallback((goal: "time" | "quality" | "tool_life" | "cost") => {
    setOptimizationGoals(prev => {
      if (prev.includes(goal)) {
        // Rimuovi l'obiettivo se già presente
        return prev.filter(g => g !== goal);
      } else {
        // Aggiungi l'obiettivo se non presente
        return [...prev, goal];
      }
    });
  }, []);

  // Ottiene il colore della severità
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return "bg-red-500";
      case "high":
        return "bg-orange-500";
      case "medium":
        return "bg-yellow-500";
      case "low":
        return "bg-blue-500";
      default:
        return "bg-gray-500";
    }
  };

  // Ottiene l'icona per il tipo di problema
  const getIssueIcon = (type: string) => {
    if (type.includes("collision") || type.includes("safety") || type.includes("critical")) {
      return <AlertCircle className="h-5 w-5 text-red-500" />;
    } else if (type.includes("inefficient") || type.includes("unoptimized")) {
      return <Settings className="h-5 w-5 text-orange-500" />;
    } else if (type.includes("quality") || type.includes("surface")) {
      return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
    } else {
      return <Info className="h-5 w-5 text-blue-500" />;
    }
  };

  // Organizza i problemi per tipo
  const getIssuesByType = () => {
    if (!analysis) return {};

    return analysis.issues.reduce(
      (acc, issue) => {
        const type = issue.type;
        if (!acc[type]) {
          acc[type] = [];
        }
        acc[type].push(issue);
        return acc;
      },
      {} as Record<string, ToolpathIssue[]>
    );
  };

  return (
    <div className={`flex flex-col h-full ${className}`}>
      <Card className="h-full flex flex-col">
        <CardHeader className="pb-2">
          <div className="flex justify-between items-center">
            <CardTitle>Toolpath Analysis</CardTitle>

            {/* Selettore percorso */}
            <Select value={selectedToolpath?.id} onValueChange={handleToolpathChange}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Select a toolpath" />
              </SelectTrigger>
              <SelectContent>
                {/* G-code dallo store */}
                {camStore.gcode && (
                  <>
                    <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Generated G-code</div>
                    <SelectItem key="store-gcode" value={camStore.gcode || "gcode-store"}>
                      {camStore.gcode || "Generated G-code"}
                    </SelectItem>
                    <Separator className="my-1" />
                  </>
                )}

                {/* Toolpaths from camStore */}
                {camStore.toolpaths.length > 0 && (
                  <>
                    <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">From CAM Store</div>
                    {camStore.toolpaths.map(t => (
                      <SelectItem key={`store-${t.id}`} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                    <Separator className="my-1" />
                  </>
                )}

                {/* Toolpaths from camAssistant */}
                {camAssistant.state.toolpaths.length > 0 && (
                  <>
                    <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">From CAM Assistant</div>
                    {camAssistant.state.toolpaths.map(t => (
                      <SelectItem key={`assistant-${t.id}`} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </>
                )}

                {/* Message if no toolpaths available */}
                {camStore.toolpaths.length === 0 && camAssistant.state.toolpaths.length === 0 && (
                  <div className="px-2 py-2 text-sm text-center text-muted-foreground">No toolpaths available</div>
                )}
              </SelectContent>
            </Select>
          </div>
          <CardDescription>
            {selectedToolpath
              ? `Analyzing ${selectedToolpath.name} with ${selectedToolpath.points?.length || 0} points`
              : "Select a toolpath to analyze"}
          </CardDescription>
        </CardHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
          <TabsList className="mx-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="issues">Issues</TabsTrigger>
            <TabsTrigger value="recommendations">Recommendations</TabsTrigger>
            <TabsTrigger value="optimize">Optimize</TabsTrigger>
          </TabsList>

          <CardContent className="flex-1 pt-2 pb-0 overflow-hidden">
            <TabsContent value="overview" className="h-full mt-0">
              {analysis ? (
                <div className="h-full flex flex-col space-y-4">
                  {/* Metriche principali */}
                  <div className="grid grid-cols-2 gap-4">
                    <Card>
                      <CardHeader className="py-2 px-4">
                        <CardTitle className="text-md">Efficiency</CardTitle>
                      </CardHeader>
                      <CardContent className="py-2 px-4">
                        <Progress value={analysis.efficiency} className="h-3" />
                        <p className="mt-1 text-right">{analysis.efficiency}%</p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="py-2 px-4">
                        <CardTitle className="text-md">Quality</CardTitle>
                      </CardHeader>
                      <CardContent className="py-2 px-4">
                        <Progress value={analysis.quality} className="h-3" />
                        <p className="mt-1 text-right">{analysis.quality}%</p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Statistiche generali */}
                  <Card>
                    <CardHeader className="py-3 px-4">
                      <CardTitle className="text-md">Toolpath Statistics</CardTitle>
                    </CardHeader>
                    <CardContent className="py-2 px-4">
                      <div className="grid grid-cols-2 gap-y-3">
                        <div>
                          <p className="text-sm text-muted-foreground">Machining Time</p>
                          <p className="font-medium">{(analysis.machiningTime / 60).toFixed(2)} min</p>
                        </div>

                        <div>
                          <p className="text-sm text-muted-foreground">Total Distance</p>
                          <p className="font-medium">{analysis.totalDistance.toFixed(2)} mm</p>
                        </div>

                        <div>
                          <p className="text-sm text-muted-foreground">Cutting Distance</p>
                          <p className="font-medium">{analysis.cuttingDistance.toFixed(2)} mm</p>
                        </div>

                        <div>
                          <p className="text-sm text-muted-foreground">Rapid Distance</p>
                          <p className="font-medium">{analysis.rapidDistance.toFixed(2)} mm</p>
                        </div>

                        <div>
                          <p className="text-sm text-muted-foreground">Avg Feed Rate</p>
                          <p className="font-medium">{analysis.avgFeedRate.toFixed(2)} mm/min</p>
                        </div>

                        <div>
                          <p className="text-sm text-muted-foreground">Max Depth Per Pass</p>
                          <p className="font-medium">{analysis.maxDepthPerPass.toFixed(2)} mm</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Summary */}
                  <Card className="flex-1">
                    <CardHeader className="py-3 px-4">
                      <CardTitle className="text-md">Summary</CardTitle>
                    </CardHeader>
                    <CardContent className="py-0 px-4 overflow-hidden">
                      <ScrollArea className="h-[calc(100%-1rem)] pr-4">
                        <div className="space-y-2">
                          <div className="flex items-start space-x-2">
                            <div className="mt-0.5">
                              {analysis.issues.length > 0 ? (
                                <AlertCircle className="h-5 w-5 text-red-500" />
                              ) : (
                                <CheckCircle2 className="h-5 w-5 text-green-500" />
                              )}
                            </div>
                            <div>
                              <p className="font-medium">{analysis.issues.length} issues found</p>
                              <p className="text-sm text-muted-foreground">
                                {analysis.issues.length > 0
                                  ? `${analysis.issues.filter(i => i.severity === "critical" || i.severity === "high").length} critical/high priority issues`
                                  : "No issues found in the toolpath"}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-start space-x-2">
                            <FileText className="h-5 w-5 text-blue-500 mt-0.5" />
                            <div>
                              <p className="font-medium">{analysis.recommendations.length} recommendations available</p>
                              <p className="text-sm text-muted-foreground">
                                Optimizing this toolpath could improve performance
                              </p>
                            </div>
                          </div>

                          <Separator className="my-3" />

                          {/* Più comuni tipi di problemi */}
                          <p className="font-medium">Common Issue Types:</p>
                          <div className="flex flex-wrap gap-2 mt-1">
                            {Object.entries(getIssuesByType())
                              .sort(([, issues1], [, issues2]) => issues2.length - issues1.length)
                              .slice(0, 5)
                              .map(([type, issues]) => (
                                <Badge key={type} variant="outline" className="flex items-center gap-1.5">
                                  {getIssueIcon(type)}
                                  <span>{type.replace(/_/g, " ")}</span>
                                  <span className="bg-gray-100 px-1 rounded text-xs">{issues.length}</span>
                                </Badge>
                              ))}
                          </div>
                        </div>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center">
                  <p className="text-muted-foreground mb-4">
                    No analysis data available. Analyze the toolpath to see insights.
                  </p>
                  <Button onClick={handleAnalyze} disabled={!selectedToolpath || isAnalyzing}>
                    {isAnalyzing ? "Analyzing..." : "Analyze Toolpath"}
                  </Button>
                </div>
              )}
            </TabsContent>

            <TabsContent value="issues" className="h-full mt-0">
              {analysis && analysis.issues.length > 0 ? (
                <ScrollArea className="h-full pr-2">
                  <Accordion type="single" collapsible className="w-full">
                    {analysis.issues.map((issue, index) => (
                      <AccordionItem key={issue.id || index} value={issue.id || `issue-${index}`}>
                        <AccordionTrigger className="py-3 px-4 hover:no-underline">
                          <div className="flex items-center">
                            <div className={`w-2 h-2 rounded-full mr-3 ${getSeverityColor(issue.severity)}`} />
                            <span className="font-medium">{issue.type.replace(/_/g, " ")}</span>
                            <Badge variant="outline" className="ml-3">
                              {issue.severity}
                            </Badge>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="px-4 pt-0 pb-3">
                          <div className="pl-5 border-l-2 border-l-gray-200">
                            <p>{issue.description}</p>
                            {issue.suggestedFix && (
                              <div className="mt-2">
                                <p className="text-sm font-medium text-green-600">Suggested Fix:</p>
                                <p className="text-sm">{issue.suggestedFix}</p>
                              </div>
                            )}
                            {issue.location && (
                              <p className="text-xs text-muted-foreground mt-2">
                                Location: Points {issue.location.startIndex} - {issue.location.endIndex}
                              </p>
                            )}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </ScrollArea>
              ) : (
                <div className="h-full flex flex-col items-center justify-center">
                  {analysis ? (
                    <div className="text-center">
                      <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto mb-2" />
                      <p className="text-muted-foreground">No issues found in this toolpath.</p>
                    </div>
                  ) : (
                    <div className="text-center">
                      <p className="text-muted-foreground mb-4">
                        No analysis data available. Analyze the toolpath to see issues.
                      </p>
                      <Button onClick={handleAnalyze} disabled={!selectedToolpath || isAnalyzing}>
                        {isAnalyzing ? "Analyzing..." : "Analyze Toolpath"}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="recommendations" className="h-full mt-0">
              {analysis && analysis.recommendations.length > 0 ? (
                <ScrollArea className="h-full pr-2">
                  <Accordion type="single" collapsible className="w-full">
                    {analysis.recommendations.map((recommendation, index) => (
                      <AccordionItem
                        key={recommendation.id || index}
                        value={recommendation.id || `recommendation-${index}`}
                      >
                        <AccordionTrigger className="py-3 px-4 hover:no-underline">
                          <div className="flex items-center">
                            <ChevronRight className="h-4 w-4 mr-2 text-blue-600" />
                            <span className="font-medium">{recommendation.type.replace(/_/g, " ")}</span>
                            <Badge
                              variant="outline"
                              className="ml-3"
                              style={{
                                backgroundColor: `rgba(59, 130, 246, ${recommendation.confidence})`
                              }}
                            >
                              {Math.round(recommendation.confidence * 100)}% confidence
                            </Badge>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="px-4 pt-0 pb-3">
                          <div className="pl-5 border-l-2 border-l-blue-100">
                            <p>{recommendation.description}</p>

                            {(recommendation.currentValue !== undefined ||
                              recommendation.recommendedValue !== undefined) && (
                              <div className="mt-2 grid grid-cols-2 gap-2">
                                {recommendation.currentValue !== undefined && (
                                  <div>
                                    <p className="text-xs text-muted-foreground">Current Value</p>
                                    <p className="text-sm font-medium">{recommendation.currentValue}</p>
                                  </div>
                                )}

                                {recommendation.recommendedValue !== undefined && (
                                  <div>
                                    <p className="text-xs text-muted-foreground">Recommended Value</p>
                                    <p className="text-sm font-medium">{recommendation.recommendedValue}</p>
                                  </div>
                                )}
                              </div>
                            )}

                            {recommendation.estimatedImprovement && (
                              <div className="mt-2">
                                <p className="text-xs text-muted-foreground">Estimated Improvements</p>
                                <div className="grid grid-cols-2 gap-2 mt-1">
                                  {recommendation.estimatedImprovement.time !== undefined && (
                                    <div className="flex items-center">
                                      <div className="w-2 h-2 rounded-full bg-green-500 mr-2" />
                                      <p className="text-sm">
                                        Time:{" "}
                                        {typeof recommendation.estimatedImprovement.time === "number" &&
                                        recommendation.estimatedImprovement.time > 1
                                          ? `${recommendation.estimatedImprovement.time.toFixed(0)} seconds`
                                          : `${recommendation.estimatedImprovement.time}%`}
                                      </p>
                                    </div>
                                  )}

                                  {recommendation.estimatedImprovement.quality !== undefined && (
                                    <div className="flex items-center">
                                      <div className="w-2 h-2 rounded-full bg-blue-500 mr-2" />
                                      <p className="text-sm">
                                        Quality: +{recommendation.estimatedImprovement.quality}%
                                      </p>
                                    </div>
                                  )}

                                  {recommendation.estimatedImprovement.toolLife !== undefined && (
                                    <div className="flex items-center">
                                      <div className="w-2 h-2 rounded-full bg-purple-500 mr-2" />
                                      <p className="text-sm">
                                        Tool Life: +{recommendation.estimatedImprovement.toolLife}%
                                      </p>
                                    </div>
                                  )}

                                  {recommendation.estimatedImprovement.cost !== undefined && (
                                    <div className="flex items-center">
                                      <div className="w-2 h-2 rounded-full bg-amber-500 mr-2" />
                                      <p className="text-sm">
                                        Cost:{" "}
                                        {typeof recommendation.estimatedImprovement.cost === "number" &&
                                        recommendation.estimatedImprovement.cost > 1
                                          ? `-${recommendation.estimatedImprovement.cost.toFixed(2)}`
                                          : `-${recommendation.estimatedImprovement.cost}%`}
                                      </p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </ScrollArea>
              ) : (
                <div className="h-full flex flex-col items-center justify-center">
                  {analysis ? (
                    <p className="text-muted-foreground">
                      No optimization recommendations available for this toolpath.
                    </p>
                  ) : (
                    <div className="text-center">
                      <p className="text-muted-foreground mb-4">
                        No analysis data available. Analyze the toolpath to see recommendations.
                      </p>
                      <Button onClick={handleAnalyze} disabled={!selectedToolpath || isAnalyzing}>
                        {isAnalyzing ? "Analyzing..." : "Analyze Toolpath"}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="optimize" className="h-full mt-0 overflow-hidden">
              <div className="h-full flex flex-col">
                <Card>
                  <CardHeader className="py-3 px-4">
                    <CardTitle className="text-md">Optimization Goals</CardTitle>
                    <CardDescription>Select what aspects of the toolpath to optimize</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0 px-4 pb-4">
                    <div className="flex flex-wrap gap-2">
                      <Badge
                        variant={optimizationGoals.includes("time") ? "default" : "outline"}
                        className="cursor-pointer hover:opacity-80 text-sm py-1 px-3"
                        onClick={() => handleGoalToggle("time")}
                      >
                        Time
                      </Badge>
                      <Badge
                        variant={optimizationGoals.includes("quality") ? "default" : "outline"}
                        className="cursor-pointer hover:opacity-80 text-sm py-1 px-3"
                        onClick={() => handleGoalToggle("quality")}
                      >
                        Quality
                      </Badge>
                      <Badge
                        variant={optimizationGoals.includes("tool_life") ? "default" : "outline"}
                        className="cursor-pointer hover:opacity-80 text-sm py-1 px-3"
                        onClick={() => handleGoalToggle("tool_life")}
                      >
                        Tool Life
                      </Badge>
                      <Badge
                        variant={optimizationGoals.includes("cost") ? "default" : "outline"}
                        className="cursor-pointer hover:opacity-80 text-sm py-1 px-3"
                        onClick={() => handleGoalToggle("cost")}
                      >
                        Cost
                      </Badge>
                    </div>
                  </CardContent>
                </Card>

                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center">
                    <p className="text-muted-foreground mb-4 max-w-md">
                      Optimize the toolpath based on the selected goals. This will generate a new toolpath with improved
                      parameters.
                    </p>
                    <Button
                      onClick={handleOptimize}
                      disabled={!selectedToolpath || isOptimizing || optimizationGoals.length === 0}
                      className="min-w-[200px]"
                    >
                      {isOptimizing ? "Optimizing..." : "Optimize Toolpath"}
                    </Button>
                  </div>
                </div>
              </div>
            </TabsContent>
          </CardContent>
        </Tabs>

        <CardFooter className="pt-2 pb-4 px-4 flex justify-between">
          {!analysis ? (
            <Button onClick={handleAnalyze} disabled={!selectedToolpath || isAnalyzing}>
              {isAnalyzing ? "Analyzing..." : "Analyze Toolpath"}
            </Button>
          ) : (
            <div className="text-sm text-muted-foreground">Analysis ID: {analysis.id}</div>
          )}
        </CardFooter>
      </Card>
    </div>
  );
};

export default ToolpathAnalysisPanel;

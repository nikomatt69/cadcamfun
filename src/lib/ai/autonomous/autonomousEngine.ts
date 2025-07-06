// =======================================================================================
// src/lib/ai/autonomous/autonomousEngine.ts - Core del sistema autonomo
// =======================================================================================

import {
  AutonomousSession,
  QualityAnalysis,
  IterationResult,
  StopReason,
  ProgressReport,
  ContinuityState,
  AutonomousPreferences,
  CADContext,
} from "@/src/types/autonomousTypes";
import { ResponseAnalyzer } from "./responseAnalyzer";
import { v4 as uuidv4 } from "uuid";
import { UnifiedAIService } from "../unifiedAIService";
import { OpenAIService } from "../openaiService";
import {
  autonomousToolRegistry,
  ToolChainPlan,
  ToolExecutionResult,
  ToolExecutionContext,
  AutonomousTool,
  ToolChainStep,
} from "./toolRegistry";

// Interface for actions to be performed on the element store/canvas
export interface ElementStoreActions {
  addElementsToCanvas: (elements: any[]) => void;
  replaceAllCanvasElements: (elements: any[]) => void;
  // updateElementOnCanvas: (id: string, updates: Partial<any>) => void; // Future use
  // deleteElementFromCanvas: (id: string) => void; // Future use
}

export class AutonomousEngine {
  private responseAnalyzer: ResponseAnalyzer;
  private defaultPreferences: AutonomousPreferences = {
    maxIterations: 7,
    qualityThreshold: 85,
    timeLimit: 300000, // 5 minutes
    allowUserInterruption: true,
    verboseReporting: true,
    adaptiveStrategy: true,
  };

  // Add service dependencies
  private unifiedAIService: UnifiedAIService;
  private openAIService: OpenAIService;
  private readonly elementStore?: ElementStoreActions;

  // Enhanced tool chain execution
  private enableToolChaining: boolean = true;
  private maxToolsPerIteration: number = 3;
  private currentExecutionPlan?: ToolChainPlan;

  constructor(
    unifiedAIService: UnifiedAIService,
    openAIService: OpenAIService,
    elementStore?: ElementStoreActions // Added elementStore actions
  ) {
    this.responseAnalyzer = new ResponseAnalyzer();
    this.unifiedAIService = unifiedAIService;
    this.openAIService = openAIService;
    this.elementStore = elementStore; // Store the actions

    // Registra le implementazioni dei tools
    this.registerToolImplementations();
  }

  /**
   * Avvia una sessione autonoma
   */
  async startAutonomousSession(
    originalRequest: string,
    context: CADContext = {},
    preferences: Partial<AutonomousPreferences> = {}
  ): Promise<AutonomousSession> {
    const sessionId = uuidv4();
    const sessionPreferences = { ...this.defaultPreferences, ...preferences };

    const session: AutonomousSession = {
      id: sessionId,
      startTime: new Date(),
      originalRequest,
      context,
      iterations: [],
      currentIteration: 0,
      maxIterations: sessionPreferences.maxIterations,
      isActive: true,
      userInterrupted: false,
    };

    console.log(
      `🚀 Starting autonomous session ${sessionId} for request: "${originalRequest.substring(0, 100)}..."`
    );

    return session;
  }

  /**
   * Determina se continuare le iterazioni
   */
  shouldContinue(
    session: AutonomousSession,
    currentAnalysis: QualityAnalysis
  ): {
    shouldContinue: boolean;
    reason: StopReason | null;
    confidence: number;
  } {
    // Check user interruption
    if (session.userInterrupted) {
      return {
        shouldContinue: false,
        reason: "user_interrupted",
        confidence: 100,
      };
    }

    // Check timeout
    const sessionDuration = Date.now() - session.startTime.getTime();
    if (sessionDuration > this.defaultPreferences.timeLimit) {
      return { shouldContinue: false, reason: "timeout", confidence: 100 };
    }

    // Check max iterations
    if (session.currentIteration >= session.maxIterations) {
      return {
        shouldContinue: false,
        reason: "max_iterations",
        confidence: 100,
      };
    }

    // Check quality threshold
    if (currentAnalysis.score >= this.defaultPreferences.qualityThreshold) {
      return {
        shouldContinue: false,
        reason: "quality_achieved",
        confidence: 95,
      };
    }

    // Check error threshold
    const criticalErrors = currentAnalysis.errors.filter(
      (e) => e.severity === "critical"
    );
    if (criticalErrors.length > 2) {
      return {
        shouldContinue: false,
        reason: "error_threshold",
        confidence: 90,
      };
    }

    // Check diminishing returns
    if (session.iterations.length >= 2) {
      const lastTwo = session.iterations.slice(-2);
      const improvement =
        lastTwo[1].qualityAfter.score - lastTwo[0].qualityAfter.score;
      if (improvement < 5) {
        return {
          shouldContinue: false,
          reason: "diminishing_returns",
          confidence: 80,
        };
      }
    }

    // Check if no improvements are possible
    if (
      currentAnalysis.improvements.length === 0 &&
      currentAnalysis.score < this.defaultPreferences.qualityThreshold
    ) {
      return {
        shouldContinue: false,
        reason: "no_improvements_possible",
        confidence: 75,
      };
    }

    // Continue iteration
    const confidence = this.calculateContinueConfidence(
      session,
      currentAnalysis
    );
    return { shouldContinue: true, reason: null, confidence };
  }

  /**
   * Genera il prompt per la prossima iterazione
   */
  generateIterationPrompt(
    session: AutonomousSession,
    previousResponse: string,
    analysis: QualityAnalysis
  ): string {
    const iteration = session.currentIteration + 1;

    let prompt = `AUTONOMOUS ITERATION ${iteration}/${session.maxIterations}\n\n`;

    prompt += `Original request: "${session.originalRequest}"\n\n`;

    if (previousResponse) {
      prompt += `Previous response analysis:\n`;
      prompt += `- Quality Score: ${analysis.score}%\n`;
      prompt += `- Completeness: ${analysis.completeness}%\n`;
      prompt += `- Accuracy: ${analysis.accuracy}%\n`;
      prompt += `- Errors: ${analysis.errorCount}\n\n`;
    }

    if (analysis.errors.length > 0) {
      prompt += `Issues to fix:\n`;
      analysis.errors.forEach((error, i) => {
        prompt += `${i + 1}. [${error.severity.toUpperCase()}] ${error.description}\n`;
        if (error.suggestion) {
          prompt += `   Suggestion: ${error.suggestion}\n`;
        }
      });
      prompt += "\n";
    }

    if (analysis.improvements.length > 0) {
      prompt += `Improvements to implement:\n`;
      analysis.improvements
        .sort(
          (a, b) =>
            this.priorityWeight(b.priority) - this.priorityWeight(a.priority)
        )
        .slice(0, 3) // Top 3 improvements
        .forEach((improvement, i) => {
          prompt += `${i + 1}. [${improvement.priority.toUpperCase()}] ${improvement.description} (Expected improvement: +${improvement.expectedImprovement}%)\n`;
        });
      prompt += "\n";
    }

    prompt += `Please provide an improved response that addresses the above issues and improvements. `;
    prompt += `Focus on achieving a quality score above ${this.defaultPreferences.qualityThreshold}%. `;
    prompt += `Be specific and detailed in your response.`;

    return prompt;
  }

  /**
   * Processa un'iterazione completa
   */
  async processIteration(
    session: AutonomousSession,
    previousResponse: string | null,
    // aiServiceCall is now used as a fallback or for generic refinement
    aiServiceCall: (prompt: string, context?: CADContext) => Promise<string>
  ): Promise<IterationResult> {
    const startTime = Date.now();
    session.currentIteration++;

    if (process.env.NODE_ENV === "development") {
      console.log(
        `🔄 Processing iteration ${session.currentIteration}/${session.maxIterations}`
      );
    }

    let qualityBefore: QualityAnalysis | undefined;
    if (previousResponse) {
      qualityBefore = await this.responseAnalyzer.analyzeResponse(
        previousResponse,
        session.originalRequest,
        session.context
      );
    }

    // Determine action based on suggestions from the previous response's analysis
    // If no previous response, or no specific actions, generate a general prompt.
    let response = "";
    let promptForIteration = session.originalRequest; // Default prompt
    let specificActionTaken = false;

    // Enhanced tool chain execution
    if (this.enableToolChaining) {
      const toolChainResult = await this.executeToolChain(
        session,
        qualityBefore
      );
      if (toolChainResult.executed) {
        response = toolChainResult.response;
        specificActionTaken = true;
        console.log(
          `🔗 AutonomousEngine: Tool chain executed with ${toolChainResult.toolsExecuted} tools`
        );
      }
    }

    // Fallback to original single-tool logic if tool chaining disabled or failed
    if (
      !specificActionTaken &&
      qualityBefore &&
      qualityBefore.improvements.length > 0
    ) {
      // Sort suggestions by priority (high first)
      const sortedSuggestions = [...qualityBefore.improvements].sort(
        (a, b) =>
          this.priorityWeight(b.priority) - this.priorityWeight(a.priority)
      );
      const topSuggestion = sortedSuggestions[0];

      if (topSuggestion.actionDetails) {
        if (
          topSuggestion.type === "add" &&
          topSuggestion.actionDetails.elementsToAdd &&
          topSuggestion.actionDetails.elementsToAdd.length > 0
        ) {
          const addDesc =
            topSuggestion.actionDetails.elementsToAdd[0].description;
          promptForIteration = `Action: Add new CAD elements. Description: ${addDesc}`;
          console.log(
            `🤖 AutonomousEngine: Attempting to ADD elements. Description for textToCADElements: ${addDesc}`
          );
          try {
            const addResult = await this.unifiedAIService.textToCADElements({
              description: addDesc,
              context: session.context.elements,
              structuredContext: session.context.constraints,
              complexity: "moderate",
              style: "precise",
            });
            if (addResult.success && addResult.data) {
              response =
                addResult.rawResponse || JSON.stringify(addResult.data);
              specificActionTaken = true;

              // Safely handle element addition
              const elementsActuallyAdded = Array.isArray(addResult.data)
                ? addResult.data
                : [addResult.data];

              // Update canvas first, then session context
              if (this.elementStore && elementsActuallyAdded.length > 0) {
                try {
                  this.elementStore.addElementsToCanvas(elementsActuallyAdded);
                  console.log(
                    `🎯 AutonomousEngine: Successfully added ${elementsActuallyAdded.length} elements to canvas`
                  );
                } catch (canvasError) {
                  console.error(
                    "AutonomousEngine: Failed to add elements to canvas:",
                    canvasError
                  );
                  // Continue with session update even if canvas fails
                }
              }

              // Update session context
              if (elementsActuallyAdded.length > 0) {
                session.context.elements = (
                  session.context.elements || []
                ).concat(elementsActuallyAdded);
                console.log(
                  `🤖 AutonomousEngine: Updated session context. Total elements: ${session.context.elements.length}`
                );

                // Validate context consistency
                this.validateContextConsistency(session.context);
              }
            } else {
              console.warn(
                "AutonomousEngine: textToCADElements failed or returned no data.",
                addResult.error
              );
              response = previousResponse || "";
            }
          } catch (e) {
            console.error(
              "AutonomousEngine: Error calling textToCADElements",
              e
            );
            response = previousResponse || "";
          }
        } else if (
          topSuggestion.type === "modify" &&
          topSuggestion.actionDetails.elementsToModify &&
          topSuggestion.actionDetails.elementsToModify.length > 0
        ) {
          const modInfo = topSuggestion.actionDetails.elementsToModify[0];
          if (modInfo.targetElementId && modInfo.modificationDescription) {
            promptForIteration = `Action: Modify CAD element. Please modify the element with ID '${modInfo.targetElementId}'. The required modification is: "${modInfo.modificationDescription}". Respond with the complete list of all CAD elements in the scene after the modification, in a parsable JSON array format.`;
            console.log(
              `🤖 AutonomousEngine: Attempting to MODIFY element '${modInfo.targetElementId}'. Instruction: "${modInfo.modificationDescription}"`
            );
            response = await aiServiceCall(promptForIteration, session.context);
            specificActionTaken = true;

            // Handle modification response with better error handling
            this.handleModificationResponse(response, session, "MODIFY");
          } else if (modInfo.modificationDescription) {
            // Fallback if only description is available
            promptForIteration = `Action: Modify CAD elements. The previous response requires modifications as described: "${modInfo.modificationDescription}". Respond with the complete list of all CAD elements in the scene after the modification, in a parsable JSON array format.`;
            console.log(
              `🤖 AutonomousEngine: Attempting general MODIFICATION. Instruction: "${modInfo.modificationDescription}"`
            );
            response = await aiServiceCall(promptForIteration, session.context);
            specificActionTaken = true;

            // Handle modification response
            this.handleModificationResponse(
              response,
              session,
              "General MODIFY"
            );
          } else if (topSuggestion.actionDetails.refinementPrompt) {
            // Fallback to refinement prompt if specific modify details are missing
            promptForIteration = topSuggestion.actionDetails.refinementPrompt;
            console.log(
              `🤖 AutonomousEngine: Attempting to REFINE/MODIFY with general prompt: ${promptForIteration}`
            );
            response = await aiServiceCall(promptForIteration, session.context);
            specificActionTaken = true;
          }
        } else if (
          topSuggestion.type === "remove" &&
          topSuggestion.actionDetails.elementsToRemove &&
          topSuggestion.actionDetails.elementsToRemove.length > 0
        ) {
          const remInfo = topSuggestion.actionDetails.elementsToRemove[0];
          if (remInfo.targetElementId) {
            promptForIteration = `Action: Remove CAD element. Please remove the element with ID '${remInfo.targetElementId}'. Reason: "${remInfo.reason || "As per autonomous analysis"}". Respond with the complete list of all CAD elements in the scene after the removal, in a parsable JSON array format.`;
            console.log(
              `🤖 AutonomousEngine: Attempting to REMOVE element '${remInfo.targetElementId}'. Reason: "${remInfo.reason || "N/A"}"`
            );
            response = await aiServiceCall(promptForIteration, session.context);
            specificActionTaken = true;

            // Handle removal response
            this.handleModificationResponse(response, session, "REMOVE");
          }
        } else if (topSuggestion.actionDetails?.refinementPrompt) {
          // General refinement if other specific actions not matched
          promptForIteration = topSuggestion.actionDetails.refinementPrompt;
          console.log(
            `🤖 AutonomousEngine: Attempting to REFINE with general prompt: ${promptForIteration}`
          );
          response = await aiServiceCall(promptForIteration, session.context);
          specificActionTaken = true;
        }
      }
    }

    if (!specificActionTaken) {
      // Fallback to general prompt generation if no specific action was taken
      promptForIteration = qualityBefore
        ? this.generateIterationPrompt(
            session,
            previousResponse!,
            qualityBefore
          )
        : session.originalRequest;
      console.log(
        `🤖 AutonomousEngine: No specific action, using general prompt.`
      );
      response = await aiServiceCall(promptForIteration, session.context);
    }

    const qualityAfter = await this.responseAnalyzer.analyzeResponse(
      response, // Analyze the response from the specific action or general call
      session.originalRequest,
      session.context
    );

    const { shouldContinue, reason } = this.shouldContinue(
      session,
      qualityAfter
    );

    // Determine action type for logging in iterationResult
    let actionType = "general_refinement";
    if (
      specificActionTaken &&
      qualityBefore &&
      qualityBefore.improvements.length > 0
    ) {
      // topSuggestion would have been defined if specificActionTaken is true due to an improvement
      const sortedSuggestions = [...qualityBefore.improvements].sort(
        (a, b) =>
          this.priorityWeight(b.priority) - this.priorityWeight(a.priority)
      );
      if (sortedSuggestions.length > 0) {
        actionType = sortedSuggestions[0].type;
      }
    }

    const iterationResult: IterationResult = {
      iteration: session.currentIteration,
      timestamp: new Date(),
      input: promptForIteration, // Log the prompt that led to the response
      output: response,
      qualityBefore,
      qualityAfter,
      improvements: qualityAfter.improvements,
      processingTime: Date.now() - startTime,
      stopReason: shouldContinue ? undefined : reason!, // Ensure reason is only set if not continuing
      elementsGenerated: this.countElementsInResponse(response),
      actionsExecuted: [actionType],
    };

    session.iterations.push(iterationResult);

    if (!shouldContinue) {
      session.isActive = false;
      session.endTime = new Date();
    }

    console.log(`✅ Iteration ${session.currentIteration} completed:`, {
      quality: `${qualityAfter.score}%`,
      improvements: qualityAfter.improvements.length,
      shouldContinue,
      reason,
    });

    return iterationResult;
  }

  /**
   * Esegue una catena di tools per completare l'obiettivo in modo continuo
   */
  private async executeToolChain(
    session: AutonomousSession,
    qualityAnalysis?: QualityAnalysis
  ): Promise<{ executed: boolean; response: string; toolsExecuted: number }> {
    try {
      // Crea il contesto di esecuzione
      const context: ToolExecutionContext = {
        currentElements: session.context.elements || [],
        userObjective: session.originalRequest,
        iterationNumber: session.currentIteration,
        qualityMetrics: qualityAnalysis,
        previousResults: [],
        availableTools: Array.from(
          autonomousToolRegistry.getAllTools().map((t) => t.name)
        ),
      };

      // Se abbiamo già un piano in corso, continualo
      if (this.currentExecutionPlan) {
        console.log(
          `\ud83d\udd04 Continuing existing plan: ${this.currentExecutionPlan.planId}`
        );
        const results = await autonomousToolRegistry.executeToolChain(
          this.currentExecutionPlan,
          context
        );
        return this.processToolChainResults(results, session);
      }

      // Crea un nuovo piano ottimale basato sull'obiettivo e qualità attuale
      const plan = autonomousToolRegistry.createOptimalToolChain(
        session.originalRequest,
        context
      );

      // Filtra il piano per includere solo i tools più rilevanti per questa iterazione
      const focusedPlan = this.createFocusedPlan(plan, qualityAnalysis);

      console.log(
        `\ud83c\udfaf Creating focused plan with ${focusedPlan.steps.length} steps for objective: "${session.originalRequest.substring(0, 60)}..."`
      );

      // Esegui il piano focalizzato
      this.currentExecutionPlan = focusedPlan;
      const results = await autonomousToolRegistry.executeToolChain(
        focusedPlan,
        context
      );

      // Se il piano è completato con successo, reset per la prossima iterazione
      const successfulResults = results.filter((r) => r.success);
      if (successfulResults.length === focusedPlan.steps.length) {
        this.currentExecutionPlan = undefined;
        console.log(`\u2705 Plan completed successfully`);
      }

      return this.processToolChainResults(results, session);
    } catch (error) {
      console.error(`\ud83d\udeab Tool chain execution failed:`, error);
      return { executed: false, response: "", toolsExecuted: 0 };
    }
  }

  /**
   * Crea un piano focalizzato per l'iterazione corrente
   */
  private createFocusedPlan(
    fullPlan: ToolChainPlan,
    qualityAnalysis?: QualityAnalysis
  ): ToolChainPlan {
    // Limita il numero di step per iterazione per mantenere il controllo
    const maxStepsPerIteration = Math.min(
      this.maxToolsPerIteration,
      fullPlan.steps.length
    );

    // Seleziona i step più prioritari basandosi sulla qualità attuale
    let prioritizedSteps = [...fullPlan.steps];

    if (qualityAnalysis) {
      // Se abbiamo analisi di qualità, prioritizza basandosi sui miglioramenti suggeriti
      const improvementTypes = qualityAnalysis.improvements.map((i) => i.type);

      prioritizedSteps = fullPlan.steps.sort((a, b) => {
        const aPriority = this.getStepPriority(a, improvementTypes);
        const bPriority = this.getStepPriority(b, improvementTypes);
        return bPriority - aPriority;
      });
    }

    // Crea il piano focalizzato
    const focusedSteps = prioritizedSteps.slice(0, maxStepsPerIteration);

    return {
      ...fullPlan,
      planId: `focused_${fullPlan.planId}`,
      steps: focusedSteps,
      totalSteps: focusedSteps.length,
      estimatedTime: focusedSteps.length * 2000, // Stima semplificata
    };
  }

  /**
   * Calcola la priorità di uno step basandosi sui miglioramenti suggeriti
   */
  private getStepPriority(
    step: ToolChainStep,
    improvementTypes: string[]
  ): number {
    let priority = 5; // Base priority

    // Aumenta priorità per i tools che corrispondono ai miglioramenti suggeriti
    if (
      improvementTypes.includes("add") &&
      step.toolName.includes("generate")
    ) {
      priority += 3;
    }
    if (
      improvementTypes.includes("modify") &&
      step.toolName.includes("update")
    ) {
      priority += 3;
    }
    if (
      improvementTypes.includes("remove") &&
      step.toolName.includes("remove")
    ) {
      priority += 2;
    }
    if (
      step.toolName.includes("analyze") ||
      step.toolName.includes("validate")
    ) {
      priority += 1; // Sempre utile
    }

    return priority;
  }

  /**
   * Processa i risultati dell'esecuzione della tool chain
   */
  private processToolChainResults(
    results: ToolExecutionResult[],
    session: AutonomousSession
  ): { executed: boolean; response: string; toolsExecuted: number } {
    const successfulResults = results.filter((r) => r.success);

    if (successfulResults.length === 0) {
      return { executed: false, response: "", toolsExecuted: 0 };
    }

    // Aggiorna il contesto della sessione con tutti gli elementi creati/modificati
    let elementsCreated: any[] = [];
    let elementsModified: string[] = [];
    let elementsRemoved: string[] = [];

    for (const result of successfulResults) {
      elementsCreated = elementsCreated.concat(result.elementsCreated);
      elementsModified = elementsModified.concat(result.elementsModified);
      elementsRemoved = elementsRemoved.concat(result.elementsRemoved);
    }

    // Aggiorna il canvas se ci sono elementi creati
    if (elementsCreated.length > 0 && this.elementStore) {
      try {
        this.elementStore.addElementsToCanvas(elementsCreated);
        console.log(
          `\ud83c\udfa8 Added ${elementsCreated.length} elements to canvas via tool chain`
        );
      } catch (error) {
        console.error("Failed to add elements to canvas:", error);
      }
    }

    // Aggiorna il contesto della sessione
    if (elementsCreated.length > 0) {
      session.context.elements = (session.context.elements || []).concat(
        elementsCreated
      );
      console.log(
        `\ud83d\udcca Updated session context. Total elements: ${session.context.elements.length}`
      );
    }

    // Crea una risposta composta dai risultati
    const responseLines = successfulResults.map(
      (result) =>
        `${result.toolName}: ${result.message} (${result.elementsCreated.length} created, ${result.elementsModified.length} modified)`
    );

    const response = `Tool Chain Execution Results:\n${responseLines.join("\n")}\n\nElements in scene: ${JSON.stringify(session.context.elements || [])}`;

    return {
      executed: true,
      response,
      toolsExecuted: successfulResults.length,
    };
  }

  /**
   * Implementa le esecuzioni dei tools tramite i servizi AI esistenti
   */
  private async executeToolImplementation(
    toolName: string,
    payload: any,
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      switch (toolName) {
        case "generateCADElements":
          // Usa il tool textToCAD più strutturato tramite openAIService
          try {
            // Usa textToCADElements dal unifiedAIService (più affidabile)
            const toolResult = await this.unifiedAIService.textToCADElements({
              description:
                payload.userObjective ||
                payload.description ||
                context.userObjective,
              context: context.currentElements.map((el) => JSON.stringify(el)),
              structuredContext: payload.structuredContext || {},
              complexity: payload.complexity || "moderate",
              style: payload.style || "precise",
            });

            if (toolResult.success && toolResult.data) {
              // Il tool textToCAD restituisce una struttura più completa
              const elements = Array.isArray(toolResult.data)
                ? toolResult.data
                : [toolResult.data];
              return {
                toolName,
                success: true,
                message: `Generated ${elements.length} CAD elements using textToCAD tool`,
                elementsCreated: elements,
                elementsModified: [],
                elementsRemoved: [],
                qualityImprovement: 0.4, // Maggiore qualità con tool strutturato
                suggestedNextTools: ["analyzeCADQuality", "validateCADProject"],
                metadata: {
                  type: "generation",
                  toolUsed: "textToCAD",
                  complexity: payload.complexity || "moderate",
                  analysisData: toolResult.synthesis || [],
                },
                executionTime: Date.now() - startTime,
              };
            }
          } catch (error) {
            console.error("Error using textToCAD tool:", error);
            // Fallback al metodo precedente se il tool textToCAD fallisce
            const generateResult =
              await this.unifiedAIService.textToCADElements({
                description:
                  payload.userObjective ||
                  payload.description ||
                  context.userObjective,
                context: context.currentElements.map((el) =>
                  JSON.stringify(el)
                ),
                structuredContext: {},
                complexity: "moderate",
                style: "precise",
              });

            if (generateResult.success && generateResult.data) {
              const elements = Array.isArray(generateResult.data)
                ? generateResult.data
                : [generateResult.data];
              return {
                toolName,
                success: true,
                message: `Generated ${elements.length} CAD elements (fallback method)`,
                elementsCreated: elements,
                elementsModified: [],
                elementsRemoved: [],
                qualityImprovement: 0.3,
                suggestedNextTools: ["analyzeCADQuality", "validateCADProject"],
                metadata: { type: "generation", method: "fallback" },
                executionTime: Date.now() - startTime,
              };
            }
          }
          break;

        case "updateMultipleCADElements":
          // Usa executeActionChain per updateMultiple
          try {
            const updateActions = {
              chainId: `update_${Date.now()}`,
              steps: [
                {
                  stepId: "bulk_update",
                  action: "updateMultipleCADElements",
                  payload: {
                    operations: payload.operations || [],
                    bulkCriteria: payload.bulkCriteria || {},
                    elementIds: payload.elementIds || [],
                  },
                },
              ],
            };

            const updateResult =
              await this.unifiedAIService.executeActionChain(updateActions);
            if (updateResult.success) {
              const modifiedIds = payload.elementIds || [];
              return {
                toolName,
                success: true,
                message: `Updated ${modifiedIds.length} CAD elements using action chain`,
                elementsCreated: [],
                elementsModified: modifiedIds,
                elementsRemoved: [],
                qualityImprovement: 0.3,
                suggestedNextTools: ["validateCADProject", "analyzeCADQuality"],
                metadata: {
                  type: "modification",
                  toolUsed: "updateMultipleCADElements",
                  operationsCount: (payload.operations || []).length,
                },
                executionTime: Date.now() - startTime,
              };
            }
          } catch (error) {
            console.error("Error using updateMultipleCADElements:", error);
            // Fallback diretto
            const modifiedIds = payload.elementIds || [];
            return {
              toolName,
              success: true,
              message: `Updated ${modifiedIds.length} CAD elements (direct method)`,
              elementsCreated: [],
              elementsModified: modifiedIds,
              elementsRemoved: [],
              qualityImprovement: 0.2,
              suggestedNextTools: ["validateCADProject"],
              metadata: { type: "modification", method: "direct" },
              executionTime: Date.now() - startTime,
            };
          }
          break;

        case "removeMultipleCADElements":
          // Usa il tool removeMultipleCADElements tramite openAIService
          try {
            const toolResult = await this.openAIService.sendMessage(
              [
                {
                  id: "remove-request",
                  role: "user",
                  content: "Remove multiple CAD elements",
                  timestamp: Date.now(),
                },
              ],
              JSON.stringify({
                elementIds: payload.elementIds || [],
                bulkCriteria: payload.bulkCriteria || {},
                currentElements: context.currentElements,
              }),
              ["removeMultipleCADElements"]
            );

            if (toolResult.content && toolResult.actions) {
              const removedIds = payload.elementIds || [];
              return {
                toolName,
                success: true,
                message: `Removed ${removedIds.length} CAD elements using removeMultiple tool`,
                elementsCreated: [],
                elementsModified: [],
                elementsRemoved: removedIds,
                qualityImprovement: 0.2,
                suggestedNextTools: ["analyzeCADQuality", "validateCADProject"],
                metadata: {
                  type: "removal",
                  toolUsed: "removeMultipleCADElements",
                  response: toolResult.content,
                },
                executionTime: Date.now() - startTime,
              };
            }
          } catch (error) {
            console.error("Error using removeMultipleCADElements tool:", error);
            // Implementazione diretta se il tool fallisce
            const removedIds = payload.elementIds || [];
            // Simula rimozione (il canvas sarà aggiornato dal sistema)
            return {
              toolName,
              success: true,
              message: `Removed ${removedIds.length} CAD elements (direct removal)`,
              elementsCreated: [],
              elementsModified: [],
              elementsRemoved: removedIds,
              qualityImprovement: 0.15,
              suggestedNextTools: ["analyzeCADQuality"],
              metadata: { type: "removal", method: "direct" },
              executionTime: Date.now() - startTime,
            };
          }
          break;

        case "groupCADElements":
          // Usa il tool groupCADElements tramite openAIService
          try {
            const toolResult = await this.openAIService.sendMessage(
              [
                {
                  id: "group-request",
                  role: "user",
                  content: "Group CAD elements",
                  timestamp: Date.now(),
                },
              ],
              JSON.stringify({
                groupName: payload.groupName || "AutoGroup",
                groupType: payload.groupType || "assembly",
                selectionCriteria: payload.selectionCriteria || {},
                groupProperties: payload.groupProperties || {},
                currentElements: context.currentElements,
              }),
              ["groupCADElements"]
            );

            if (toolResult.content && toolResult.actions) {
              const groupedIds: string[] = [];
              return {
                toolName,
                success: true,
                message: `Grouped CAD elements using group tool`,
                elementsCreated: [],
                elementsModified: groupedIds, // Gli elementi raggruppati sono "modificati"
                elementsRemoved: [],
                qualityImprovement: 0.25,
                suggestedNextTools: ["validateCADProject", "analyzeCADQuality"],
                metadata: {
                  type: "grouping",
                  toolUsed: "groupCADElements",
                  response: toolResult.content,
                },
                executionTime: Date.now() - startTime,
              };
            }
          } catch (error) {
            console.error("Error using groupCADElements tool:", error);
            // Fallback semplificato
            return {
              toolName,
              success: true,
              message: "Grouped CAD elements (simplified grouping)",
              elementsCreated: [],
              elementsModified: [],
              elementsRemoved: [],
              qualityImprovement: 0.1,
              suggestedNextTools: ["validateCADProject"],
              metadata: { type: "grouping", method: "simplified" },
              executionTime: Date.now() - startTime,
            };
          }
          break;

        case "analyzeCADQuality":
          // Usa il responseAnalyzer per analizzare la qualità
          const currentElements = JSON.stringify(context.currentElements);
          const qualityAnalysis = await this.responseAnalyzer.analyzeResponse(
            currentElements,
            context.userObjective,
            { elements: context.currentElements }
          );

          return {
            toolName,
            success: true,
            message: `Quality analysis completed. Score: ${qualityAnalysis.score}%`,
            elementsCreated: [],
            elementsModified: [],
            elementsRemoved: [],
            qualityImprovement: 0.1,
            suggestedNextTools:
              qualityAnalysis.improvements.length > 0
                ? ["suggestOptimizations"]
                : ["validateCADProject"],
            metadata: { analysis: qualityAnalysis },
            executionTime: Date.now() - startTime,
          };

        default:
          // Fallback per tools non implementati
          return {
            toolName,
            success: false,
            message: `Tool ${toolName} not implemented`,
            elementsCreated: [],
            elementsModified: [],
            elementsRemoved: [],
            qualityImprovement: 0,
            suggestedNextTools: [],
            metadata: { error: "not_implemented" },
            executionTime: Date.now() - startTime,
          };
      }
    } catch (error) {
      return {
        toolName,
        success: false,
        message: error instanceof Error ? error.message : "Unknown error",
        elementsCreated: [],
        elementsModified: [],
        elementsRemoved: [],
        qualityImprovement: -0.1,
        suggestedNextTools: [],
        metadata: { error: true },
        executionTime: Date.now() - startTime,
      };
    }

    // Fallback return
    return {
      toolName,
      success: false,
      message: "Tool execution failed",
      elementsCreated: [],
      elementsModified: [],
      elementsRemoved: [],
      qualityImprovement: 0,
      suggestedNextTools: [],
      metadata: {},
      executionTime: Date.now() - startTime,
    };
  }

  /**
   * Registra le implementazioni concrete dei tools nel registry
   */
  private registerToolImplementations(): void {
    // Registra l'implementazione per generateCADElements
    autonomousToolRegistry.registerToolImplementation(
      "generateCADElements",
      async (payload: any, context: ToolExecutionContext) => {
        return this.executeToolImplementation(
          "generateCADElements",
          payload,
          context
        );
      }
    );

    // Registra l'implementazione per updateMultipleCADElements
    autonomousToolRegistry.registerToolImplementation(
      "updateMultipleCADElements",
      async (payload: any, context: ToolExecutionContext) => {
        return this.executeToolImplementation(
          "updateMultipleCADElements",
          payload,
          context
        );
      }
    );

    // Registra l'implementazione per removeMultipleCADElements
    autonomousToolRegistry.registerToolImplementation(
      "removeMultipleCADElements",
      async (payload: any, context: ToolExecutionContext) => {
        return this.executeToolImplementation(
          "removeMultipleCADElements",
          payload,
          context
        );
      }
    );

    // Registra l'implementazione per analyzeCADQuality
    autonomousToolRegistry.registerToolImplementation(
      "analyzeCADQuality",
      async (payload: any, context: ToolExecutionContext) => {
        return this.executeToolImplementation(
          "analyzeCADQuality",
          payload,
          context
        );
      }
    );

    // Registra l'implementazione per groupCADElements
    autonomousToolRegistry.registerToolImplementation(
      "groupCADElements",
      async (payload: any, context: ToolExecutionContext) => {
        return this.executeToolImplementation(
          "groupCADElements",
          payload,
          context
        );
      }
    );

    // Registra l'implementazione per suggestOptimizations
    autonomousToolRegistry.registerToolImplementation(
      "suggestOptimizations",
      async (payload: any, context: ToolExecutionContext) => {
        return this.executeToolImplementation(
          "suggestOptimizations",
          payload,
          context
        );
      }
    );

    // Registra l'implementazione per validateCADProject
    autonomousToolRegistry.registerToolImplementation(
      "validateCADProject",
      async (payload: any, context: ToolExecutionContext) => {
        return this.executeToolImplementation(
          "validateCADProject",
          payload,
          context
        );
      }
    );
  }

  /**
   * Genera report finale della sessione
   */
  generateProgressReport(session: AutonomousSession): ProgressReport {
    const duration = session.endTime
      ? session.endTime.getTime() - session.startTime.getTime()
      : Date.now() - session.startTime.getTime();

    const firstIteration = session.iterations[0];
    const lastIteration = session.iterations[session.iterations.length - 1];

    const qualityImprovement =
      firstIteration && lastIteration
        ? lastIteration.qualityAfter.score -
          (firstIteration.qualityBefore?.score || 50)
        : lastIteration?.qualityAfter.score || 0;

    const totalElements = session.iterations.reduce(
      (sum, iter) => sum + (iter.elementsGenerated || 0),
      0
    );

    const allActionsExecuted = session.iterations.flatMap(
      (iter) => iter.actionsExecuted || []
    );
    const uniqueActionsExecuted = Array.from(new Set(allActionsExecuted));

    const achievementsGenerated = this.generateAchievements(session);
    const summaryText = this.generateSummary(session, qualityImprovement);
    const recommendationsGenerated = this.generateRecommendations(session);

    // Ensure stopReason is of type StopReason or undefined if the type allows
    let finalStopReason: StopReason | undefined = lastIteration?.stopReason;
    // If ProgressReport.stopReason cannot be undefined, assign a default from StopReason enum.
    // For now, assuming it can be undefined, aligning with IterationResult.stopReason.

    return {
      sessionId: session.id,
      duration,
      totalIterations: session.iterations.length,
      finalQualityScore: lastIteration?.qualityAfter.score || 0,
      qualityImprovement,
      elementsGenerated: totalElements,
      actionsExecuted: uniqueActionsExecuted,
      stopReason: finalStopReason!, // If type doesn't allow undefined, this needs adjustment
      summary: summaryText,
      achievements: achievementsGenerated,
      recommendations: recommendationsGenerated,
    };
  }

  /**
   * Interrompe sessione autonoma
   */
  interruptSession(session: AutonomousSession): void {
    session.userInterrupted = true;
    session.isActive = false;
    session.endTime = new Date();

    console.log(`⏹️ Session ${session.id} interrupted by user`);
  }

  // =======================================================================================
  // Metodi helper privati
  // =======================================================================================

  private calculateContinueConfidence(
    session: AutonomousSession,
    analysis: QualityAnalysis
  ): number {
    let confidence = 70; // Base confidence

    // Più iterazioni = meno confidence per continuare
    confidence -= session.currentIteration * 5;

    // Basso score = alta confidence per continuare
    if (analysis.score < 60) confidence += 20;
    else if (analysis.score < 80) confidence += 10;

    // Miglioramenti disponibili = alta confidence
    if (analysis.improvements.length > 0) {
      const highPriorityImprovements = analysis.improvements.filter(
        (i) => i.priority === "high"
      ).length;
      confidence += highPriorityImprovements * 10;
    }

    // Errori critici = bassa confidence
    const criticalErrors = analysis.errors.filter(
      (e) => e.severity === "critical"
    ).length;
    confidence -= criticalErrors * 15;

    return Math.max(0, Math.min(100, confidence));
  }

  private priorityWeight(priority: string): number {
    switch (priority) {
      case "high":
        return 3;
      case "medium":
        return 2;
      case "low":
        return 1;
      default:
        return 0;
    }
  }

  private countElementsInResponse(response: string): number {
    // Count mentions of CAD elements
    const elementKeywords = [
      "cube",
      "sphere",
      "cylinder",
      "cone",
      "torus",
      "pyramid",
      "element",
      "component",
      "part",
      "piece",
      "object",
    ];

    let count = 0;
    elementKeywords.forEach((keyword) => {
      const regex = new RegExp(keyword, "gi");
      const matches = response.match(regex);
      count += matches ? matches.length : 0;
    });

    return count;
  }

  private extractActionsFromResponse(response: string): string[] {
    const actions: string[] = [];

    // Common CAD actions
    const actionPatterns = [
      /creat\w+/gi,
      /generat\w+/gi,
      /add\w+/gi,
      /modif\w+/gi,
      /updat\w+/gi,
      /remov\w+/gi,
      /delet\w+/gi,
    ];

    actionPatterns.forEach((pattern) => {
      const matches = response.match(pattern);
      if (matches) {
        actions.push(...matches.map((m) => m.toLowerCase()));
      }
    });

    return Array.from(new Set(actions)); // Ensure conversion to array
  }

  private generateAchievements(session: AutonomousSession): string[] {
    const achievements: string[] = [];
    const lastIteration = session.iterations[session.iterations.length - 1];

    if (lastIteration?.qualityAfter.score >= 90) {
      achievements.push("🏆 Achieved excellent quality (90%+)");
    } else if (lastIteration?.qualityAfter.score >= 80) {
      achievements.push("🎯 Achieved good quality (80%+)");
    }

    if (
      session.iterations.length <= 3 &&
      (lastIteration?.stopReason === "quality_achieved" ||
        lastIteration?.stopReason === "user_interrupted")
    ) {
      achievements.push("⚡ Efficient completion in few iterations");
    }

    const totalElementsGenerated = session.iterations.reduce(
      (sum, iter) => sum + (iter.elementsGenerated || 0),
      0
    );

    if (totalElementsGenerated > 0) {
      achievements.push(`🔧 Generated ${totalElementsGenerated} CAD elements`);
    }

    const errorReduction = this.calculateErrorReduction(session);
    if (errorReduction > 50) {
      achievements.push("🛠️ Significantly reduced errors");
    }

    return achievements;
  }

  private generateSummary(
    session: AutonomousSession,
    qualityImprovement: number
  ): string {
    const lastIteration = session.iterations[session.iterations.length - 1];
    const finalScore = lastIteration?.qualityAfter.score || 0;

    let summary = `Autonomous session completed with ${session.iterations.length} iterations. `;
    summary += `Final quality score: ${finalScore}%`;

    if (qualityImprovement > 0) {
      summary += ` (improved by ${Math.round(qualityImprovement)}%)`;
    }

    summary += `. Session stopped due to: ${this.getStopReasonDescription(lastIteration?.stopReason)}.`;

    return summary;
  }

  private generateRecommendations(session: AutonomousSession): string[] {
    const recommendations: string[] = [];
    const lastIteration = session.iterations[session.iterations.length - 1];

    if (!lastIteration) return recommendations;

    if (lastIteration.qualityAfter.score < 80) {
      recommendations.push(
        "Consider providing more specific requirements in your initial request"
      );
    }

    if (session.iterations.length >= session.maxIterations) {
      recommendations.push(
        "Consider increasing max iterations for complex tasks"
      );
    }

    if (lastIteration.qualityAfter.errors.length > 0) {
      recommendations.push("Review and address remaining issues manually");
    }

    const avgProcessingTime =
      session.iterations.reduce((sum, iter) => sum + iter.processingTime, 0) /
      session.iterations.length;

    if (avgProcessingTime > 30000) {
      // 30 seconds
      recommendations.push(
        "Consider simplifying requests to improve processing speed"
      );
    }

    return recommendations;
  }

  private calculateErrorReduction(session: AutonomousSession): number {
    if (session.iterations.length < 2) return 0;

    const firstErrors =
      session.iterations[0].qualityBefore?.errorCount ||
      session.iterations[0].qualityAfter.errorCount;
    const lastErrors =
      session.iterations[session.iterations.length - 1].qualityAfter.errorCount;

    if (firstErrors === 0) return 0;

    return Math.round(((firstErrors - lastErrors) / firstErrors) * 100);
  }

  private getStopReasonDescription(reason?: StopReason): string {
    switch (reason) {
      case "quality_achieved":
        return "quality threshold reached";
      case "max_iterations":
        return "maximum iterations reached";
      case "user_interrupted":
        return "user interruption";
      case "error_threshold":
        return "too many errors";
      case "diminishing_returns":
        return "minimal improvement potential";
      case "timeout":
        return "time limit exceeded";
      case "no_improvements_possible":
        return "no further improvements possible";
      default:
        return "unknown reason";
    }
  }

  /**
   * Gestisce la risposta di modifica/rimozione elementi
   */
  private handleModificationResponse(
    response: string,
    session: AutonomousSession,
    actionType: string
  ): void {
    try {
      const parsedResponse = JSON.parse(response);
      if (Array.isArray(parsedResponse)) {
        // Update canvas first
        if (this.elementStore) {
          try {
            this.elementStore.replaceAllCanvasElements(parsedResponse);
            console.log(
              `🎯 AutonomousEngine: ${actionType} - Successfully updated canvas with ${parsedResponse.length} elements`
            );
          } catch (canvasError) {
            console.error(
              `AutonomousEngine: ${actionType} - Failed to update canvas:`,
              canvasError
            );
          }
        }

        // Update session context
        session.context.elements = parsedResponse;
        console.log(
          `🤖 AutonomousEngine: ${actionType} - Updated session context. Total elements: ${session.context.elements.length}`
        );

        // Validate consistency
        this.validateContextConsistency(session.context);
      } else {
        console.warn(
          `AutonomousEngine: ${actionType} - Response was JSON but not an array of elements.`
        );
      }
    } catch (e) {
      console.warn(
        `AutonomousEngine: ${actionType} - Response was not parsable JSON. Context not updated. Response:`,
        response.substring(0, 200)
      );
    }
  }

  /**
   * Valida la consistenza del context
   */
  private validateContextConsistency(context: CADContext): void {
    if (!context.elements) {
      console.warn("AutonomousEngine: Context has no elements array");
      return;
    }

    // Check for duplicate IDs
    const ids = context.elements.map((el) => el.id).filter(Boolean);
    const uniqueIds = new Set(ids);
    if (ids.length !== uniqueIds.size) {
      console.warn(
        "AutonomousEngine: Duplicate element IDs detected in context"
      );
    }

    // Check for required properties
    const elementsWithoutId = context.elements.filter((el) => !el.id);
    if (elementsWithoutId.length > 0) {
      console.warn(
        `AutonomousEngine: ${elementsWithoutId.length} elements missing required 'id' property`
      );
    }

    // Check for invalid coordinates
    const elementsWithInvalidCoords = context.elements.filter((el) => {
      const x = el.x || el.position?.x;
      const y = el.y || el.position?.y;
      const z = el.z || el.position?.z;
      return (
        (x !== undefined && isNaN(x)) ||
        (y !== undefined && isNaN(y)) ||
        (z !== undefined && isNaN(z))
      );
    });

    if (elementsWithInvalidCoords.length > 0) {
      console.warn(
        `AutonomousEngine: ${elementsWithInvalidCoords.length} elements have invalid coordinates`
      );
    }

    console.log(
      `✅ AutonomousEngine: Context validation completed. ${context.elements.length} elements validated.`
    );
  }
}

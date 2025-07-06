// import { AIAction } from "@/src/types/AITypes"; // Unused import
import { Element } from "@/src/store/elementsStore";

/**
 * Rappresenta un tool disponibile per l'autonomous agent
 */
export interface AutonomousTool {
  name: string;
  description: string;
  category: 'generation' | 'modification' | 'analysis' | 'optimization' | 'validation' | 'export';
  priority: number; // 1-10, higher = more important
  executionTime: 'fast' | 'medium' | 'slow';
  dependencies: string[]; // Tools that should run before this one
  conflicts: string[]; // Tools that cannot run with this one
  conditions: ToolCondition[]; // When this tool should be used
  execute: (payload: any, context: ToolExecutionContext) => Promise<ToolExecutionResult>;
}

/**
 * Condizione per determinare quando un tool è applicabile
 */
export interface ToolCondition {
  type: 'element_count' | 'element_type' | 'missing_property' | 'quality_score' | 'objective_type';
  operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'contains' | 'missing';
  value: any;
  weight: number; // 0-1, importance of this condition
}

/**
 * Contesto di esecuzione per i tools
 */
export interface ToolExecutionContext {
  currentElements: Element[];
  userObjective: string;
  iterationNumber: number;
  qualityMetrics: any;
  previousResults: ToolExecutionResult[];
  availableTools: string[];
}

/**
 * Risultato dell'esecuzione di un tool
 */
export interface ToolExecutionResult {
  toolName: string;
  success: boolean;
  message: string;
  elementsCreated: Element[];
  elementsModified: string[];
  elementsRemoved: string[];
  qualityImprovement: number; // -1 to 1
  suggestedNextTools: string[];
  metadata: Record<string, any>;
  executionTime: number;
}

/**
 * Piano di esecuzione per una catena di tools
 */
export interface ToolChainPlan {
  planId: string;
  objective: string;
  totalSteps: number;
  estimatedTime: number;
  confidence: number; // 0-1
  steps: ToolChainStep[];
  fallbackPlan?: ToolChainPlan;
}

/**
 * Singolo step in una catena di tools
 */
export interface ToolChainStep {
  stepId: string;
  toolName: string;
  payload: any;
  dependencies: string[];
  canRunInParallel: boolean;
  expectedOutcome: string;
  successCriteria: ToolCondition[];
  onFailure: 'retry' | 'skip' | 'abort' | 'fallback';
  maxRetries: number;
}

/**
 * Registro dinamico dei tools disponibili per l'autonomous agent
 */
export class AutonomousToolRegistry {
  private tools: Map<string, AutonomousTool> = new Map();
  private toolUsageStats: Map<string, ToolUsageStats> = new Map();

  constructor() {
    this.initializeDefaultTools();
    this.loadToolUsageHistory();
  }

  /**
   * Registra un nuovo tool nel registry
   */
  registerTool(tool: AutonomousTool): void {
    this.tools.set(tool.name, tool);
    if (!this.toolUsageStats.has(tool.name)) {
      this.toolUsageStats.set(tool.name, {
        totalExecutions: 0,
        successfulExecutions: 0,
        averageExecutionTime: 0,
        averageQualityImprovement: 0,
        lastUsed: null
      });
    }
  }

  /**
   * Ottiene tutti i tools disponibili
   */
  getAllTools(): AutonomousTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Ottiene un tool specifico per nome
   */
  getTool(name: string): AutonomousTool | undefined {
    return this.tools.get(name);
  }

  /**
   * Trova i tools più adatti per un determinato contesto
   */
  findSuitableTools(context: ToolExecutionContext, maxTools: number = 5): AutonomousTool[] {
    const scored = Array.from(this.tools.values())
      .map(tool => ({
        tool,
        score: this.calculateToolScore(tool, context)
      }))
      .filter(item => item.score > 0.3) // Soglia minima di rilevanza
      .sort((a, b) => b.score - a.score)
      .slice(0, maxTools);

    return scored.map(item => item.tool);
  }

  /**
   * Crea un piano di esecuzione ottimale per raggiungere un obiettivo
   */
  createOptimalToolChain(objective: string, context: ToolExecutionContext): ToolChainPlan {
    const suitableTools = this.findSuitableTools(context, 10);
    const steps: ToolChainStep[] = [];
    
    // Analizza l'obiettivo per determinare la sequenza di tools necessaria
    const objectiveAnalysis = this.analyzeObjective(objective, context);
    
    // Genera gli step basandosi sull'analisi
    for (const phase of objectiveAnalysis.phases) {
      const toolsForPhase = suitableTools.filter(tool => 
        tool.category === phase.category && 
        this.toolMatchesPhase(tool, phase, context)
      );

      for (const tool of toolsForPhase.slice(0, phase.maxTools || 2)) {
        const step: ToolChainStep = {
          stepId: `${phase.name}_${tool.name}_${steps.length}`,
          toolName: tool.name,
          payload: this.generatePayloadForTool(tool, phase, context),
          dependencies: steps.filter(s => tool.dependencies.includes(s.toolName)).map(s => s.stepId),
          canRunInParallel: phase.allowParallel && tool.dependencies.length === 0,
          expectedOutcome: phase.expectedOutcome,
          successCriteria: phase.successCriteria || [],
          onFailure: phase.onFailure || 'retry',
          maxRetries: tool.executionTime === 'fast' ? 3 : 1
        };
        steps.push(step);
      }
    }

    return {
      planId: `plan_${Date.now()}`,
      objective,
      totalSteps: steps.length,
      estimatedTime: this.estimatePlanExecutionTime(steps),
      confidence: this.calculatePlanConfidence(steps, context),
      steps,
      fallbackPlan: steps.length > 3 ? this.createSimplifiedPlan(objective, context) : undefined
    };
  }

  /**
   * Registra un'implementazione di esecuzione per un tool
   */
  registerToolImplementation(toolName: string, implementation: (payload: any, context: ToolExecutionContext) => Promise<ToolExecutionResult>): void {
    const tool = this.tools.get(toolName);
    if (tool) {
      tool.execute = implementation;
    }
  }

  /**
   * Esegue un piano di tool chain
   */
  async executeToolChain(plan: ToolChainPlan, context: ToolExecutionContext): Promise<ToolExecutionResult[]> {
    const results: ToolExecutionResult[] = [];
    const executedSteps = new Set<string>();
    const failedSteps = new Set<string>();

    // Ordina gli step per dipendenze
    const sortedSteps = this.topologicalSort(plan.steps);

    for (const step of sortedSteps) {
      // Verifica se le dipendenze sono soddisfatte
      const dependenciesMet = step.dependencies.every(dep => executedSteps.has(dep));
      if (!dependenciesMet) {
        continue;
      }

      // Verifica se ci sono conflitti
      const hasConflicts = this.checkStepConflicts(step, executedSteps);
      if (hasConflicts) {
        continue;
      }

      const tool = this.getTool(step.toolName);
      if (!tool) {
        failedSteps.add(step.stepId);
        continue;
      }

      let attempts = 0;
      let success = false;

      while (attempts < step.maxRetries && !success) {
        try {
          attempts++;
          const result = await tool.execute(step.payload, {
            ...context,
            previousResults: results
          });

          // Valuta il successo basandosi sui criteri
          const meetsSuccessCriteria = this.evaluateSuccessCriteria(result, step.successCriteria, context);
          
          if (result.success && meetsSuccessCriteria) {
            results.push(result);
            executedSteps.add(step.stepId);
            this.updateToolUsageStats(step.toolName, result);
            success = true;
          } else {
            throw new Error(`Success criteria not met: ${result.message}`);
          }
        } catch (error) {
          if (attempts >= step.maxRetries) {
            const failureResult: ToolExecutionResult = {
              toolName: step.toolName,
              success: false,
              message: error instanceof Error ? error.message : 'Unknown error',
              elementsCreated: [],
              elementsModified: [],
              elementsRemoved: [],
              qualityImprovement: -0.1,
              suggestedNextTools: [],
              metadata: { error: true, attempts },
              executionTime: 0
            };
            results.push(failureResult);
            failedSteps.add(step.stepId);

            // Gestisce il fallimento secondo la strategia definita
            if (step.onFailure === 'abort') {
              break;
            }
          }
        }
      }
    }

    return results;
  }

  /**
   * Calcola il punteggio di rilevanza di un tool per un determinato contesto
   */
  private calculateToolScore(tool: AutonomousTool, context: ToolExecutionContext): number {
    let score = 0;

    // Valuta le condizioni del tool
    for (const condition of tool.conditions) {
      const conditionMet = this.evaluateToolCondition(condition, context);
      if (conditionMet) {
        score += condition.weight;
      }
    }

    // Considera le statistiche di utilizzo
    const stats = this.toolUsageStats.get(tool.name);
    if (stats) {
      const successRate = stats.totalExecutions > 0 ? stats.successfulExecutions / stats.totalExecutions : 0.5;
      score *= (0.5 + successRate * 0.5); // Peso del 50% per il tasso di successo
      
      // Bonus per il miglioramento della qualità
      if (stats.averageQualityImprovement > 0) {
        score *= (1 + stats.averageQualityImprovement * 0.3);
      }
    }

    // Considera la priorità del tool
    score *= (tool.priority / 10);

    return Math.min(score, 1); // Normalizza a 0-1
  }

  /**
   * Inizializza i tools di default del sistema
   */
  private initializeDefaultTools(): void {
    // Tool per generazione elementi
    this.registerTool({
      name: 'generateCADElements',
      description: 'Genera nuovi elementi CAD usando il tool textToCAD strutturato',
      category: 'generation',
      priority: 9,
      executionTime: 'medium',
      dependencies: [],
      conflicts: [],
      conditions: [
        { type: 'element_count', operator: 'less_than', value: 50, weight: 0.8 },
        { type: 'objective_type', operator: 'contains', value: 'create', weight: 0.9 },
        { type: 'objective_type', operator: 'contains', value: 'crea', weight: 0.9 },
        { type: 'objective_type', operator: 'contains', value: 'genera', weight: 0.9 },
        { type: 'objective_type', operator: 'contains', value: 'costruisci', weight: 0.8 },
        { type: 'objective_type', operator: 'contains', value: 'progetta', weight: 0.8 }
      ],
      execute: async (_payload, _context) => {
        // Implementazione delegata a autonomousEngine con tool textToCAD
        throw new Error('Tool execution should be implemented by the autonomous engine');
      }
    });

    // Tool per aggiornamento multiplo
    this.registerTool({
      name: 'updateMultipleCADElements',
      description: 'Aggiorna più elementi CAD contemporaneamente usando il tool strutturato',
      category: 'modification',
      priority: 8,
      executionTime: 'fast',
      dependencies: [],
      conflicts: ['removeMultipleCADElements'],
      conditions: [
        { type: 'element_count', operator: 'greater_than', value: 1, weight: 0.8 },
        { type: 'objective_type', operator: 'contains', value: 'modify', weight: 0.9 },
        { type: 'objective_type', operator: 'contains', value: 'update', weight: 0.9 },
        { type: 'objective_type', operator: 'contains', value: 'cambia', weight: 0.8 }
      ],
      execute: async (_payload, _context) => {
        throw new Error('Tool execution should be implemented by the autonomous engine');
      }
    });

    // Tool per rimozione multipla
    this.registerTool({
      name: 'removeMultipleCADElements',
      description: 'Rimuove più elementi CAD contemporaneamente usando il tool strutturato',
      category: 'modification',
      priority: 6,
      executionTime: 'fast',
      dependencies: [],
      conflicts: ['updateMultipleCADElements'],
      conditions: [
        { type: 'element_count', operator: 'greater_than', value: 2, weight: 0.7 },
        { type: 'objective_type', operator: 'contains', value: 'remove', weight: 0.9 },
        { type: 'objective_type', operator: 'contains', value: 'elimina', weight: 0.9 },
        { type: 'objective_type', operator: 'contains', value: 'cancella', weight: 0.8 }
      ],
      execute: async (_payload, _context) => {
        throw new Error('Tool execution should be implemented by the autonomous engine');
      }
    });

    // Tool per grouping
    this.registerTool({
      name: 'groupCADElements',
      description: 'Raggruppa elementi CAD correlati usando il tool strutturato',
      category: 'optimization',
      priority: 7,
      executionTime: 'fast',
      dependencies: ['generateCADElements'],
      conflicts: [],
      conditions: [
        { type: 'element_count', operator: 'greater_than', value: 2, weight: 0.8 },
        { type: 'objective_type', operator: 'contains', value: 'group', weight: 0.8 },
        { type: 'objective_type', operator: 'contains', value: 'raggruppa', weight: 0.8 },
        { type: 'objective_type', operator: 'contains', value: 'assembly', weight: 0.9 }
      ],
      execute: async (_payload, _context) => {
        throw new Error('Tool execution should be implemented by the autonomous engine');
      }
    });

    // Tool per analisi qualità
    this.registerTool({
      name: 'analyzeCADQuality',
      description: 'Analizza la qualità del progetto CAD',
      category: 'analysis',
      priority: 8,
      executionTime: 'fast',
      dependencies: [],
      conflicts: [],
      conditions: [
        { type: 'element_count', operator: 'greater_than', value: 0, weight: 1.0 }
      ],
      execute: async (_payload, _context) => {
        throw new Error('Tool execution should be implemented by the autonomous engine');
      }
    });

    // Tool per ottimizzazioni
    this.registerTool({
      name: 'suggestOptimizations',
      description: 'Suggerisce ottimizzazioni per il progetto',
      category: 'optimization',
      priority: 6,
      executionTime: 'medium',
      dependencies: ['analyzeCADQuality'],
      conflicts: [],
      conditions: [
        { type: 'quality_score', operator: 'less_than', value: 0.8, weight: 0.9 }
      ],
      execute: async (_payload, _context) => {
        throw new Error('Tool execution should be implemented by the autonomous engine');
      }
    });

    // Tool per validazione
    this.registerTool({
      name: 'validateCADProject',
      description: 'Valida la correttezza del progetto CAD',
      category: 'validation',
      priority: 7,
      executionTime: 'fast',
      dependencies: [],
      conflicts: [],
      conditions: [
        { type: 'element_count', operator: 'greater_than', value: 0, weight: 1.0 }
      ],
      execute: async (_payload, _context) => {
        throw new Error('Tool execution should be implemented by the autonomous engine');
      }
    });
  }

  private loadToolUsageHistory(): void {
    // Placeholder per caricare statistiche di utilizzo da storage persistente
  }

  private analyzeObjective(objective: string, context: ToolExecutionContext): ObjectiveAnalysis {
    // Analisi semplificata dell'obiettivo
    const phases: ObjectivePhase[] = [];

    if (objective.toLowerCase().includes('create') || objective.toLowerCase().includes('genera')) {
      phases.push({
        name: 'generation',
        category: 'generation',
        maxTools: 2,
        allowParallel: false,
        expectedOutcome: 'New CAD elements created',
        successCriteria: [
          { type: 'element_count', operator: 'greater_than', value: context.currentElements.length, weight: 1.0 }
        ],
        onFailure: 'retry'
      });
    }

    if (objective.toLowerCase().includes('improve') || objective.toLowerCase().includes('ottimizza')) {
      phases.push({
        name: 'optimization',
        category: 'optimization',
        maxTools: 2,
        allowParallel: true,
        expectedOutcome: 'Project optimized',
        successCriteria: [
          { type: 'quality_score', operator: 'greater_than', value: 0.7, weight: 0.8 }
        ],
        onFailure: 'skip'
      });
    }

    if (objective.toLowerCase().includes('analyze') || objective.toLowerCase().includes('analizza')) {
      phases.push({
        name: 'analysis',
        category: 'analysis',
        maxTools: 1,
        allowParallel: false,
        expectedOutcome: 'Analysis completed',
        successCriteria: [],
        onFailure: 'retry'
      });
    }

    // Aggiungi sempre validazione alla fine
    phases.push({
      name: 'validation',
      category: 'validation',
      maxTools: 1,
      allowParallel: false,
      expectedOutcome: 'Project validated',
      successCriteria: [],
      onFailure: 'skip'
    });

    return { phases };
  }

  private toolMatchesPhase(tool: AutonomousTool, phase: ObjectivePhase, _context: ToolExecutionContext): boolean {
    return tool.category === phase.category;
  }

  private generatePayloadForTool(_tool: AutonomousTool, phase: ObjectivePhase, context: ToolExecutionContext): any {
    // Genera payload specifico per il tool basandosi sul contesto
    return {
      userObjective: context.userObjective,
      currentElements: context.currentElements,
      phase: phase.name
    };
  }

  private estimatePlanExecutionTime(steps: ToolChainStep[]): number {
    const timeMap = { fast: 1000, medium: 3000, slow: 8000 };
    return steps.reduce((total, step) => {
      const tool = this.getTool(step.toolName);
      const baseTime = tool ? timeMap[tool.executionTime] : 2000;
      return total + baseTime * step.maxRetries;
    }, 0);
  }

  private calculatePlanConfidence(steps: ToolChainStep[], _context: ToolExecutionContext): number {
    if (steps.length === 0) return 0;

    const stepConfidences = steps.map(step => {
      const tool = this.getTool(step.toolName);
      if (!tool) return 0.3;

      const stats = this.toolUsageStats.get(step.toolName);
      const successRate = stats ? (stats.totalExecutions > 0 ? stats.successfulExecutions / stats.totalExecutions : 0.5) : 0.5;
      
      return successRate * 0.7 + (tool.priority / 10) * 0.3;
    });

    return stepConfidences.reduce((sum, conf) => sum + conf, 0) / stepConfidences.length;
  }

  private createSimplifiedPlan(objective: string, context: ToolExecutionContext): ToolChainPlan {
    // Crea un piano semplificato con meno step per il fallback
    const essentialTools = this.findSuitableTools(context, 3);
    const steps: ToolChainStep[] = essentialTools.map((tool, index) => ({
      stepId: `simple_${tool.name}_${index}`,
      toolName: tool.name,
      payload: { userObjective: context.userObjective, simplified: true },
      dependencies: [],
      canRunInParallel: false,
      expectedOutcome: 'Basic objective completion',
      successCriteria: [],
      onFailure: 'skip',
      maxRetries: 1
    }));

    return {
      planId: `simple_plan_${Date.now()}`,
      objective: `Simplified: ${objective}`,
      totalSteps: steps.length,
      estimatedTime: this.estimatePlanExecutionTime(steps),
      confidence: 0.6,
      steps
    };
  }

  private topologicalSort(steps: ToolChainStep[]): ToolChainStep[] {
    const sorted: ToolChainStep[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (step: ToolChainStep) => {
      if (visiting.has(step.stepId)) {
        throw new Error(`Circular dependency detected: ${step.stepId}`);
      }
      if (visited.has(step.stepId)) {
        return;
      }

      visiting.add(step.stepId);
      
      // Visita le dipendenze prima
      for (const depId of step.dependencies) {
        const depStep = steps.find(s => s.stepId === depId);
        if (depStep) {
          visit(depStep);
        }
      }

      visiting.delete(step.stepId);
      visited.add(step.stepId);
      sorted.push(step);
    };

    for (const step of steps) {
      if (!visited.has(step.stepId)) {
        visit(step);
      }
    }

    return sorted;
  }

  private checkStepConflicts(step: ToolChainStep, executedSteps: Set<string>): boolean {
    const tool = this.getTool(step.toolName);
    if (!tool) return false;

    for (const conflictToolName of tool.conflicts) {
      // Verifica se un tool in conflitto è già stato eseguito
      const conflictExecuted = Array.from(executedSteps).some(stepId => {
        const executedStep = stepId; // Simplified check
        return executedStep.includes(conflictToolName);
      });
      if (conflictExecuted) return true;
    }

    return false;
  }

  private evaluateSuccessCriteria(result: ToolExecutionResult, criteria: ToolCondition[], context: ToolExecutionContext): boolean {
    if (criteria.length === 0) return result.success;

    const metCriteria = criteria.filter(criterion => 
      this.evaluateToolCondition(criterion, context)
    );

    // Richiede che almeno il 70% dei criteri sia soddisfatto
    return metCriteria.length / criteria.length >= 0.7;
  }

  private evaluateToolCondition(condition: ToolCondition, context: ToolExecutionContext): boolean {
    switch (condition.type) {
      case 'element_count':
        const count = context.currentElements.length;
        return this.compareValues(count, condition.operator, condition.value);
      
      case 'element_type':
        const hasType = context.currentElements.some(el => el.type === condition.value);
        return condition.operator === 'equals' ? hasType : !hasType;
      
      case 'objective_type':
        const objective = context.userObjective.toLowerCase();
        return condition.operator === 'contains' ? 
          objective.includes(condition.value.toLowerCase()) :
          !objective.includes(condition.value.toLowerCase());
      
      case 'quality_score':
        const score = context.qualityMetrics?.overallScore || 0.5;
        return this.compareValues(score, condition.operator, condition.value);
      
      default:
        return false;
    }
  }

  private compareValues(actual: any, operator: string, expected: any): boolean {
    switch (operator) {
      case 'equals': return actual === expected;
      case 'not_equals': return actual !== expected;
      case 'greater_than': return actual > expected;
      case 'less_than': return actual < expected;
      case 'contains': return actual.toString().includes(expected.toString());
      default: return false;
    }
  }

  private updateToolUsageStats(toolName: string, result: ToolExecutionResult): void {
    const stats = this.toolUsageStats.get(toolName);
    if (!stats) return;

    stats.totalExecutions++;
    if (result.success) {
      stats.successfulExecutions++;
    }
    stats.averageExecutionTime = (stats.averageExecutionTime + result.executionTime) / 2;
    stats.averageQualityImprovement = (stats.averageQualityImprovement + result.qualityImprovement) / 2;
    stats.lastUsed = new Date();
  }
}

// Tipi di supporto
interface ToolUsageStats {
  totalExecutions: number;
  successfulExecutions: number;
  averageExecutionTime: number;
  averageQualityImprovement: number;
  lastUsed: Date | null;
}

interface ObjectiveAnalysis {
  phases: ObjectivePhase[];
}

interface ObjectivePhase {
  name: string;
  category: AutonomousTool['category'];
  maxTools?: number;
  allowParallel: boolean;
  expectedOutcome: string;
  successCriteria?: ToolCondition[];
  onFailure?: 'retry' | 'skip' | 'abort' | 'fallback';
}

// Esporta istanza singleton
export const autonomousToolRegistry = new AutonomousToolRegistry();
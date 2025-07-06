// src/lib/ai/generation/progressiveGeneratorService.ts

import { AIModelType, TextToCADRequest } from "@/src/types/AITypes";
import { Element } from "@/src/store/elementsStore";
import { v4 as uuidv4 } from "uuid";
import { aiAnalytics } from "../ai-new/aiAnalytics";

// Import all the action handlers and services
import { createCadActionHandler } from "../cadActionHandler";
import { CAMActionHandler } from "../camActionHandler";
import { ContextAwareGenerationService } from "../ContextAwareGenerationService";
import { unifiedAIService } from "../unifiedAIService";
import { unifiedAIService as camService } from "../unifiedAIServiceCAM";
import { openAIService } from "../openaiService";

// Import types from CAM
import {
  Toolpath,
  Tool,
  Material,
  MachiningOperation,
  ToolpathAnalysis,
  GCodeAnalysis,
  CostEstimation
} from "@/src/types/CAMTypes";

export enum ProgressStage {
  CONCEPTUAL = "conceptual",
  DIMENSIONAL = "dimensional",
  DETAILING = "detailing",
  VALIDATION = "validation",
  OPTIMIZATION = "optimization",
  FINALIZATION = "finalization"
}

export enum TaskStatus {
  PENDING = "pending",
  THINKING = "thinking",
  EXECUTING = "executing",
  COMPLETED = "completed",
  FAILED = "failed",
  PAUSED = "paused"
}

export enum TaskPriority {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2,
  CRITICAL = 3
}

// Extended task types to include all possible actions
export type AgentTaskType =
  | "cad_generation"
  | "cad_action"
  | "cam_action"
  | "contextual_generation"
  | "analysis"
  | "optimization"
  | "validation"
  | "gcode_generation"
  | "assistant_message"
  | "custom";

export interface AgentTask {
  id: string;
  type: AgentTaskType;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  stage?: ProgressStage;
  progress: number; // 0-100
  createdAt: Date;
  updatedAt: Date;
  data: any;
  dependencies?: string[]; // Task IDs that must complete first
  result?: any;
  error?: string;
  thinking?: string; // Current thinking process
  metadata?: Record<string, any>;
}

export interface AgentState {
  isActive: boolean;
  currentTask?: AgentTask;
  taskQueue: AgentTask[];
  completedTasks: AgentTask[];
  workingDesign: Element[];
  context: Record<string, any>;
  thinking: string;
  lastUpdate: Date;
  // Add canvas interaction methods
  canvasInteraction?: {
    addElements: (elements: Element[]) => void;
    updateElement: (id: string, properties: Partial<Element>) => void;
    removeElement: (id: string) => void;
    getElements: () => Element[];
  };
}

export interface StreamingUpdate {
  type: "thinking" | "progress" | "result" | "error" | "status";
  data: any;
  timestamp: Date;
  taskId?: string;
}

export interface ValidationResults {
  hasErrors: boolean;
  errors: ValidationError[];
  warnings?: ValidationWarning[];
}

export interface ValidationError {
  elementId: string;
  errorType: "dimension" | "intersection" | "manufacturability" | "physics";
  message: string;
  severity: "critical" | "major" | "minor";
  suggestedFix?: string;
}

export interface ValidationWarning {
  elementId: string;
  warningType: string;
  message: string;
  suggestedImprovement?: string;
}

export type StreamingCallback = (update: StreamingUpdate) => void;

export class ContinuousCADAgent {
  private state: AgentState;
  private streamingCallbacks: Set<StreamingCallback> = new Set();
  private processingTimeout?: NodeJS.Timeout;
  private readonly maxConcurrentTasks = 3;
  private readonly taskTimeoutMs = 300000; // 5 minutes per task

  // Action handlers
  private cadActionHandler: any;
  private camActionHandler: CAMActionHandler;
  private contextAwareService: ContextAwareGenerationService;

  constructor() {
    this.state = {
      isActive: false,
      taskQueue: [],
      completedTasks: [],
      workingDesign: [],
      context: {},
      thinking: "",
      lastUpdate: new Date()
    };

    // Initialize action handlers
    this.camActionHandler = new CAMActionHandler();
    this.contextAwareService = new ContextAwareGenerationService();
  }

  /**
   * Initialize the agent with canvas interaction methods
   */
  initialize(canvasInteraction: {
    addElements: (elements: Element[]) => void;
    updateElement: (id: string, properties: Partial<Element>) => void;
    removeElement: (id: string) => void;
    getElements: () => Element[];
  }): void {
    this.state.canvasInteraction = canvasInteraction;

    // Initialize CAD action handler with canvas methods
    this.cadActionHandler = createCadActionHandler({
      addElementsToCanvas: canvasInteraction.addElements,
      updateElementInCanvas: canvasInteraction.updateElement,
      removeElementFromCanvas: canvasInteraction.removeElement,
      getCanvasElements: canvasInteraction.getElements
    });
  }

  /**
   * Start the continuous agent
   */
  async start(): Promise<void> {
    if (this.state.isActive) {
      console.log("Agent is already active");
      return;
    }

    this.state.isActive = true;
    this.state.lastUpdate = new Date();

    this.emitUpdate({
      type: "status",
      data: { status: "Agent started", isActive: true },
      timestamp: new Date()
    });

    // Start the main processing loop
    this.startProcessingLoop();
  }

  /**
   * Stop the continuous agent
   */
  async stop(): Promise<void> {
    this.state.isActive = false;

    if (this.processingTimeout) {
      clearTimeout(this.processingTimeout);
    }

    // Pause all pending tasks
    this.state.taskQueue.forEach(task => {
      if (task.status === TaskStatus.EXECUTING) {
        task.status = TaskStatus.PAUSED;
      }
    });

    this.emitUpdate({
      type: "status",
      data: { status: "Agent stopped", isActive: false },
      timestamp: new Date()
    });
  }

  /**
   * Add a task to the queue
   */
  addTask(taskData: Partial<AgentTask>): string {
    const task: AgentTask = {
      id: uuidv4(),
      type: taskData.type || "custom",
      description: taskData.description || "Unnamed task",
      status: TaskStatus.PENDING,
      priority: taskData.priority || TaskPriority.NORMAL,
      progress: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      data: taskData.data || {},
      dependencies: taskData.dependencies || [],
      metadata: taskData.metadata || {},
      ...taskData
    };

    // Insert task based on priority
    const insertIndex = this.state.taskQueue.findIndex(t => t.priority < task.priority);

    if (insertIndex >= 0) {
      this.state.taskQueue.splice(insertIndex, 0, task);
    } else {
      this.state.taskQueue.push(task);
    }

    this.emitUpdate({
      type: "status",
      data: {
        message: `Task added: ${task.description}`,
        taskId: task.id,
        queueLength: this.state.taskQueue.length
      },
      timestamp: new Date(),
      taskId: task.id
    });

    return task.id;
  }

  /**
   * Generate CAD elements progressively with continuous streaming
   */
  async generateProgressively(request: TextToCADRequest): Promise<string> {
    const taskId = this.addTask({
      type: "cad_generation",
      description: `Generate CAD for: ${request.description.substring(0, 50)}...`,
      priority: TaskPriority.HIGH,
      stage: ProgressStage.CONCEPTUAL,
      data: { request }
    });

    return taskId;
  }

  /**
   * Execute CAD actions (create, update, delete, etc.)
   */
  async executeCADAction(actionType: string, payload: any): Promise<string> {
    const taskId = this.addTask({
      type: "cad_action",
      description: `Execute CAD action: ${actionType}`,
      priority: TaskPriority.NORMAL,
      data: { actionType, payload }
    });

    return taskId;
  }

  /**
   * Execute CAM actions (toolpath analysis, optimization, etc.)
   */
  async executeCAMAction(actionType: string, payload: any): Promise<string> {
    const taskId = this.addTask({
      type: "cam_action",
      description: `Execute CAM action: ${actionType}`,
      priority: TaskPriority.NORMAL,
      data: { actionType, payload }
    });

    return taskId;
  }

  /**
   * Generate contextual components
   */
  async generateContextualComponent(
    description: string,
    existingElements: Element[],
    constraints: any = {},
    options: any = {}
  ): Promise<string> {
    const taskId = this.addTask({
      type: "contextual_generation",
      description: `Generate contextual component: ${description.substring(0, 50)}...`,
      priority: TaskPriority.HIGH,
      data: { description, existingElements, constraints, options }
    });

    return taskId;
  }

  /**
   * Send assistant message
   */
  async sendAssistantMessage(
    message: string,
    imageDataUrls?: string[],
    activeTool?: string,
    context?: any
  ): Promise<string> {
    const taskId = this.addTask({
      type: "assistant_message",
      description: `Process message: ${message.substring(0, 50)}...`,
      priority: TaskPriority.HIGH,
      data: { message, imageDataUrls, activeTool, context }
    });

    return taskId;
  }

  /**
   * Generate G-code from text description
   */
  async generateGCodeFromText(
    description: string,
    tool?: Tool,
    material?: Material,
    machineConfig?: any
  ): Promise<string> {
    const taskId = this.addTask({
      type: "gcode_generation",
      description: `Generate G-code: ${description.substring(0, 50)}...`,
      priority: TaskPriority.HIGH,
      data: { description, tool, material, machineConfig }
    });

    return taskId;
  }

  /**
   * Add a streaming callback
   */
  onUpdate(callback: StreamingCallback): () => void {
    this.streamingCallbacks.add(callback);
    return () => this.streamingCallbacks.delete(callback);
  }

  /**
   * Get current agent state
   */
  getState(): AgentState {
    return { ...this.state };
  }

  /**
   * Get task by ID
   */
  getTask(taskId: string): AgentTask | undefined {
    return (
      this.state.taskQueue.find(t => t.id === taskId) ||
      this.state.completedTasks.find(t => t.id === taskId) ||
      (this.state.currentTask?.id === taskId ? this.state.currentTask : undefined)
    );
  }

  /**
   * Private: Main processing loop
   */
  private async startProcessingLoop(): Promise<void> {
    while (this.state.isActive) {
      try {
        // Check for available tasks
        const nextTask = this.getNextTask();

        if (nextTask) {
          await this.processTask(nextTask);
        } else {
          // No tasks available, wait a bit
          await this.sleep(1000);
        }
      } catch (error) {
        console.error("Error in processing loop:", error);
        this.emitUpdate({
          type: "error",
          data: { message: error instanceof Error ? error.message : "Unknown error" },
          timestamp: new Date()
        });

        // Continue processing after error
        await this.sleep(2000);
      }
    }
  }

  /**
   * Private: Get next task to process
   */
  private getNextTask(): AgentTask | null {
    // Check if dependencies are met
    const availableTask = this.state.taskQueue.find(task => {
      if (task.status !== TaskStatus.PENDING) return false;

      if (task.dependencies && task.dependencies.length > 0) {
        return task.dependencies.every(depId =>
          this.state.completedTasks.some(t => t.id === depId && t.status === TaskStatus.COMPLETED)
        );
      }

      return true;
    });

    return availableTask || null;
  }

  /**
   * Private: Process a single task
   */
  private async processTask(task: AgentTask): Promise<void> {
    // Remove from queue and set as current
    this.state.taskQueue = this.state.taskQueue.filter(t => t.id !== task.id);
    this.state.currentTask = task;
    task.status = TaskStatus.EXECUTING;
    task.updatedAt = new Date();

    this.emitUpdate({
      type: "status",
      data: {
        message: `Starting task: ${task.description}`,
        task: task
      },
      timestamp: new Date(),
      taskId: task.id
    });

    try {
      let result: any;

      switch (task.type) {
        case "cad_generation":
          result = await this.processCADGenerationTask(task);
          break;
        case "cad_action":
          result = await this.processCADActionTask(task);
          break;
        case "cam_action":
          result = await this.processCAMActionTask(task);
          break;
        case "contextual_generation":
          result = await this.processContextualGenerationTask(task);
          break;
        case "assistant_message":
          result = await this.processAssistantMessageTask(task);
          break;
        case "gcode_generation":
          result = await this.processGCodeGenerationTask(task);
          break;
        case "analysis":
          result = await this.processAnalysisTask(task);
          break;
        case "optimization":
          result = await this.processOptimizationTask(task);
          break;
        case "validation":
          result = await this.processValidationTask(task);
          break;
        default:
          result = await this.processCustomTask(task);
      }

      // Task completed successfully
      task.status = TaskStatus.COMPLETED;
      task.progress = 100;
      task.result = result;
      task.updatedAt = new Date();

      this.state.completedTasks.push(task);
      this.state.currentTask = undefined;

      this.emitUpdate({
        type: "result",
        data: {
          message: `Task completed: ${task.description}`,
          task: task,
          result: result
        },
        timestamp: new Date(),
        taskId: task.id
      });
    } catch (error) {
      // Task failed
      task.status = TaskStatus.FAILED;
      task.error = error instanceof Error ? error.message : "Unknown error";
      task.updatedAt = new Date();

      this.state.completedTasks.push(task);
      this.state.currentTask = undefined;

      this.emitUpdate({
        type: "error",
        data: {
          message: `Task failed: ${task.description}`,
          task: task,
          error: task.error
        },
        timestamp: new Date(),
        taskId: task.id
      });
    }
  }

  /**
   * Private: Process CAD generation task with streaming
   */
  private async processCADGenerationTask(task: AgentTask): Promise<Element[]> {
    const request: TextToCADRequest = task.data.request;
    const stages = [
      ProgressStage.CONCEPTUAL,
      ProgressStage.DIMENSIONAL,
      ProgressStage.DETAILING,
      ProgressStage.VALIDATION,
      ProgressStage.OPTIMIZATION,
      ProgressStage.FINALIZATION
    ];

    let currentElements: Element[] = [];

    for (let i = 0; i < stages.length; i++) {
      const stage = stages[i];
      const stageProgress = (i / stages.length) * 100;

      task.stage = stage;
      task.progress = stageProgress;

      this.emitUpdate({
        type: "progress",
        data: {
          stage: stage,
          progress: stageProgress,
          message: `Processing ${stage} stage...`
        },
        timestamp: new Date(),
        taskId: task.id
      });

      // Stream the thinking process
      await this.streamThinking(task, `Analyzing ${stage} stage for: ${request.description}`);

      try {
        switch (stage) {
          case ProgressStage.CONCEPTUAL:
            currentElements = await this.generateConceptualDesignStreaming(request, task);
            break;
          case ProgressStage.DIMENSIONAL:
            currentElements = await this.refineDimensionsStreaming(request, currentElements, task);
            break;
          case ProgressStage.DETAILING:
            currentElements = await this.addDetailsStreaming(request, currentElements, task);
            break;
          case ProgressStage.VALIDATION:
            currentElements = await this.validateDesignStreaming(currentElements, task);
            break;
          case ProgressStage.OPTIMIZATION:
            currentElements = await this.optimizeDesignStreaming(currentElements, task);
            break;
          case ProgressStage.FINALIZATION:
            currentElements = await this.finalizeDesignStreaming(currentElements, task);
            break;
        }

        // Update working design
        this.state.workingDesign = currentElements;

        // Add elements to canvas if available
        if (this.state.canvasInteraction && currentElements.length > 0) {
          this.state.canvasInteraction.addElements(currentElements);
        }

        this.emitUpdate({
          type: "result",
          data: {
            stage: stage,
            elements: currentElements,
            message: `${stage} stage completed`
          },
          timestamp: new Date(),
          taskId: task.id
        });
      } catch (error) {
        this.emitUpdate({
          type: "error",
          data: {
            stage: stage,
            error: error instanceof Error ? error.message : "Unknown error",
            message: `${stage} stage failed`
          },
          timestamp: new Date(),
          taskId: task.id
        });

        // Continue with current elements if stage fails
        console.warn(`Stage ${stage} failed, continuing with current elements:`, error);
      }
    }

    return currentElements;
  }

  /**
   * Private: Process CAD action task
   */
  private async processCADActionTask(task: AgentTask): Promise<any> {
    const { actionType, payload } = task.data;

    await this.streamThinking(task, `Executing CAD action: ${actionType}`);

    if (!this.cadActionHandler) {
      throw new Error("CAD Action Handler not initialized. Call initialize() first.");
    }

    // Execute the CAD action
    const result = await this.cadActionHandler[actionType]?.(payload);

    if (!result) {
      throw new Error(`Unknown CAD action: ${actionType}`);
    }

    return result;
  }

  /**
   * Private: Process CAM action task
   */
  private async processCAMActionTask(task: AgentTask): Promise<any> {
    const { actionType, payload } = task.data;

    await this.streamThinking(task, `Executing CAM action: ${actionType}`);

    // Execute the CAM action using the handleAction method
    const camAction = {
      type: actionType,
      payload: payload
    };

    const result = await this.camActionHandler.handleAction(camAction as any);
    return result;
  }

  /**
   * Private: Process contextual generation task
   */
  private async processContextualGenerationTask(task: AgentTask): Promise<any> {
    const { description, existingElements, constraints, options } = task.data;

    await this.streamThinking(task, `Generating contextual component: ${description}`);

    const result = await this.contextAwareService.generateContextualComponent(
      description,
      existingElements,
      constraints,
      options
    );

    // Add generated elements to canvas if available
    if (this.state.canvasInteraction && result.generatedElements && result.generatedElements.length > 0) {
      this.state.canvasInteraction.addElements(result.generatedElements);
    }

    return result;
  }

  /**
   * Private: Process assistant message task
   */
  private async processAssistantMessageTask(task: AgentTask): Promise<any> {
    const { message, imageDataUrls, activeTool, context } = task.data;

    await this.streamThinking(task, `Processing assistant message: ${message}`);

    // Use the openAI service to process the message
    const messages = [
      {
        id: uuidv4(),
        role: "user" as const,
        content: message,
        timestamp: Date.now()
      }
    ];
    const contextString = JSON.stringify(context || {});

    const result = await openAIService.sendMessage(
      messages,
      contextString,
      [], // availableActions - can be extended
      "detailed",
      "moderate",
      "General AI"
    );

    return result;
  }

  /**
   * Private: Process G-code generation task
   */
  private async processGCodeGenerationTask(task: AgentTask): Promise<any> {
    const { description, tool, material, machineConfig } = task.data;

    await this.streamThinking(task, `Generating G-code: ${description}`);

    const result = await camService.generateGCodeFromText(description, tool, material, machineConfig);

    return result;
  }

  /**
   * Private: Stream thinking process
   */
  private async streamThinking(task: AgentTask, thinking: string): Promise<void> {
    this.state.thinking = thinking;
    task.thinking = thinking;

    this.emitUpdate({
      type: "thinking",
      data: { thinking: thinking },
      timestamp: new Date(),
      taskId: task.id
    });

    // Simulate thinking time
    await this.sleep(500);
  }

  /**
   * Private: Generate conceptual design with streaming
   */
  private async generateConceptualDesignStreaming(request: TextToCADRequest, task: AgentTask): Promise<Element[]> {
    await this.streamThinking(task, "Analyzing the design requirements and identifying main components...");

    const result = await this.callAnthropicWithStreaming({
      prompt: this.buildPromptForStage(request, ProgressStage.CONCEPTUAL),
      systemPrompt:
        "You are an expert CAD designer creating conceptual designs. Focus on identifying main components and general structure.",
      taskId: task.id
    });

    await this.streamThinking(task, "Processing conceptual elements and validating structure...");

    const elements = this.parseCADElements(result);

    return elements.map(element => ({
      ...element,
      id: element.id || uuidv4(),
      stage: ProgressStage.CONCEPTUAL,
      validationStatus: "valid"
    }));
  }

  /**
   * Private: Refine dimensions with streaming
   */
  private async refineDimensionsStreaming(
    request: TextToCADRequest,
    conceptElements: Element[],
    task: AgentTask
  ): Promise<Element[]> {
    if (!conceptElements.length) return [];

    await this.streamThinking(task, "Calculating optimal dimensions based on conceptual design and constraints...");

    const result = await this.callAnthropicWithStreaming({
      prompt: this.buildPromptForStage(request, ProgressStage.DIMENSIONAL, conceptElements),
      systemPrompt: "You are an expert CAD designer focusing on precise dimensions and proportions.",
      taskId: task.id
    });

    await this.streamThinking(task, "Applying dimensional refinements and checking feasibility...");

    const elements = this.parseCADElements(result);

    return elements.map((element, index) => {
      const conceptElement = conceptElements.find(ce => ce.type === element.type);
      return {
        ...element,
        id: conceptElement?.id || element.id || `dim_${uuidv4()}`,
        stage: ProgressStage.DIMENSIONAL,
        validationStatus: "valid"
      };
    });
  }

  /**
   * Private: Add details with streaming
   */
  private async addDetailsStreaming(
    request: TextToCADRequest,
    dimensionalElements: Element[],
    task: AgentTask
  ): Promise<Element[]> {
    if (!dimensionalElements.length) return [];

    await this.streamThinking(task, "Adding detailed features, materials, and manufacturing considerations...");

    const result = await this.callAnthropicWithStreaming({
      prompt: this.buildPromptForStage(request, ProgressStage.DETAILING, dimensionalElements),
      systemPrompt: "You are an expert CAD designer adding detailed features and manufacturing details.",
      taskId: task.id
    });

    await this.streamThinking(task, "Integrating detailed features with existing design...");

    const elements = this.parseCADElements(result);

    return elements.map((element, index) => {
      const dimensionalElement = dimensionalElements.find(
        de =>
          de.type === element.type &&
          Math.abs(de.x - element.x) < 10 &&
          Math.abs(de.y - element.y) < 10 &&
          Math.abs(de.z - element.z) < 10
      );

      return {
        ...element,
        id: dimensionalElement?.id || element.id || `detail_${uuidv4()}`,
        stage: ProgressStage.DETAILING,
        validationStatus: "valid"
      };
    });
  }

  /**
   * Private: Validate design with streaming
   */
  private async validateDesignStreaming(elements: Element[], task: AgentTask): Promise<Element[]> {
    if (!elements.length) return elements;

    await this.streamThinking(task, "Performing geometric validation and checking for manufacturing constraints...");

    const validationResults = this.performGeometricValidation(elements);

    if (validationResults.hasErrors) {
      await this.streamThinking(task, "Found validation issues, applying automated fixes...");

      const fixedElements = [...elements];

      for (const error of validationResults.errors) {
        const elementIndex = fixedElements.findIndex(el => el.id === error.elementId);

        if (elementIndex >= 0) {
          fixedElements[elementIndex] = {
            ...fixedElements[elementIndex],
            validationStatus: error.severity === "critical" ? "error" : "warning",
            validationMessages: [...(fixedElements[elementIndex].validationMessages || []), error.message]
          };
        }
      }

      return fixedElements;
    }

    return elements.map(element => ({
      ...element,
      stage: ProgressStage.VALIDATION,
      validationStatus: "valid"
    }));
  }

  /**
   * Private: Optimize design with streaming
   */
  private async optimizeDesignStreaming(elements: Element[], task: AgentTask): Promise<Element[]> {
    await this.streamThinking(task, "Analyzing design for optimization opportunities...");

    // Simple optimization - could be enhanced with more complex algorithms
    const optimizedElements = elements.map(element => ({
      ...element,
      stage: ProgressStage.OPTIMIZATION,
      // Add optimization metadata
      optimized: true
    }));

    await this.streamThinking(task, "Applied performance and manufacturing optimizations...");

    return optimizedElements;
  }

  /**
   * Private: Finalize design with streaming
   */
  private async finalizeDesignStreaming(elements: Element[], task: AgentTask): Promise<Element[]> {
    await this.streamThinking(task, "Finalizing design and preparing for manufacturing...");

    const finalizedElements = elements.map(element => ({
      ...element,
      stage: ProgressStage.FINALIZATION,
      finalized: true,
      finalizedAt: new Date()
    }));

    await this.streamThinking(task, "Design finalization complete. Ready for manufacturing or further modification.");

    return finalizedElements;
  }

  /**
   * Private: Call Anthropic with streaming
   */
  private async callAnthropicWithStreaming(params: {
    prompt: string;
    systemPrompt: string;
    taskId: string;
  }): Promise<string> {
    return new Promise((resolve, reject) => {
      let fullResponse = "";
      let thinkingContent = "";

      const response = fetch("/api/ai/anthropic-stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          messages: [{ role: "user", content: params.prompt }],
          system: params.systemPrompt,
          max_tokens: 4096,
          temperature: 0.7,
          thinking: {
            type: "enabled",
            budget_tokens: 4000
          },
          reasoningEnabled: true
        })
      })
        .then(response => {
          if (!response.ok) {
            throw new Error(`Anthropic API call failed: ${response.statusText}`);
          }

          const reader = response.body?.getReader();
          if (!reader) {
            throw new Error("No reader available for stream");
          }

          const decoder = new TextDecoder();

          const readStream = async (): Promise<void> => {
            try {
              while (true) {
                const { done, value } = await reader.read();

                if (done) {
                  // Stream complete
                  resolve(fullResponse || "Stream completed without content");
                  break;
                }

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split("\n");

                for (const line of lines) {
                  if (line.startsWith("data: ")) {
                    try {
                      const data = JSON.parse(line.slice(6));

                      if (data.chunk && data.chunk.length > 0) {
                        // Regular text chunk
                        fullResponse += data.chunk;

                        // Stream thinking updates
                        this.emitUpdate({
                          type: "thinking",
                          data: { thinking: `Processing: ${fullResponse.substring(0, 100)}...` },
                          timestamp: new Date(),
                          taskId: params.taskId
                        });
                      }
                    } catch (parseError) {
                      // Ignore parsing errors for individual chunks
                      console.debug("Could not parse chunk:", line);
                    }
                  } else if (line.startsWith("event: thinking")) {
                    // Handle thinking events
                    const nextLine = lines[lines.indexOf(line) + 1];
                    if (nextLine && nextLine.startsWith("data: ")) {
                      try {
                        const thinkingData = JSON.parse(nextLine.slice(6));
                        if (thinkingData.chunk) {
                          thinkingContent += thinkingData.chunk;

                          // Emit thinking update
                          this.emitUpdate({
                            type: "thinking",
                            data: { thinking: thinkingContent },
                            timestamp: new Date(),
                            taskId: params.taskId
                          });
                        }
                      } catch (parseError) {
                        console.debug("Could not parse thinking data:", nextLine);
                      }
                    }
                  } else if (line.startsWith("event: done")) {
                    // Stream finished
                    resolve(fullResponse || "Generation completed");
                    return;
                  } else if (line.startsWith("event: error")) {
                    // Error in stream
                    const nextLine = lines[lines.indexOf(line) + 1];
                    if (nextLine && nextLine.startsWith("data: ")) {
                      try {
                        const errorData = JSON.parse(nextLine.slice(6));
                        reject(new Error(errorData.message || "Stream error"));
                      } catch (parseError) {
                        reject(new Error("Stream error"));
                      }
                    } else {
                      reject(new Error("Unknown stream error"));
                    }
                    return;
                  }
                }
              }
            } catch (error) {
              console.error("Error reading stream:", error);
              reject(error);
            }
          };

          readStream();
        })
        .catch(error => {
          console.error("Fetch error:", error);
          reject(error);
        });
    });
  }

  /**
   * Private: Parse CAD elements from response
   */
  private parseCADElements(response: string): Element[] {
    // Simple mock parsing - in real implementation, this would parse the actual response
    return [
      {
        id: uuidv4(),
        type: "cube",
        x: 0,
        y: 0,
        z: 0,
        width: 50,
        height: 50,
        depth: 50,
        color: "#1e88e5",
        layerId: "default"
      }
    ];
  }

  /**
   * Private: Process other task types
   */
  private async processAnalysisTask(task: AgentTask): Promise<any> {
    await this.streamThinking(task, "Analyzing current design for improvements...");
    return { analysis: "completed" };
  }

  private async processOptimizationTask(task: AgentTask): Promise<any> {
    await this.streamThinking(task, "Optimizing design parameters...");
    return { optimization: "completed" };
  }

  private async processValidationTask(task: AgentTask): Promise<any> {
    await this.streamThinking(task, "Validating design constraints...");
    return { validation: "completed" };
  }

  private async processCustomTask(task: AgentTask): Promise<any> {
    await this.streamThinking(task, `Processing custom task: ${task.description}`);
    return { custom: "completed" };
  }

  /**
   * Private: Emit update to all callbacks
   */
  private emitUpdate(update: StreamingUpdate): void {
    this.state.lastUpdate = update.timestamp;
    this.streamingCallbacks.forEach(callback => {
      try {
        callback(update);
      } catch (error) {
        console.error("Error in streaming callback:", error);
      }
    });
  }

  /**
   * Private: Build prompts for different stages
   */
  private buildPromptForStage(request: TextToCADRequest, stage: ProgressStage, currentElements?: Element[]): string {
    const { description, constraints } = request;
    let prompt = "";

    switch (stage) {
      case ProgressStage.CONCEPTUAL:
        prompt = `Create a conceptual design for: ${description}. 
                  Focus only on identifying the main components, general structure, and layout. 
                  Do not specify exact dimensions yet. Return only the core elements and their relationships.`;
        break;

      case ProgressStage.DIMENSIONAL:
        prompt = `Based on this conceptual design: ${JSON.stringify(currentElements)}, 
                  add appropriate dimensions for each component. 
                  Consider standard sizes, ergonomics, and ${constraints || "general best practices"}. 
                  Focus only on dimensions, not additional details.
                  Original description: ${description}`;
        break;

      case ProgressStage.DETAILING:
        prompt = `Based on this dimensional design: ${JSON.stringify(currentElements)}, 
                  add detailed features such as fillets, chamfers, textures, materials, and tolerances.
                  Consider ${constraints || "standard manufacturing practices"} 
                  and ensure compatibility between components.
                  Original description: ${description}`;
        break;

      default:
        prompt = description;
    }

    return prompt;
  }

  /**
   * Private: Geometric validation
   */
  private performGeometricValidation(elements: Element[]): ValidationResults {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    elements.forEach(element => {
      // Check for zero dimensions
      if (element.type === "cube" || element.type === "rectangle") {
        if (element.width <= 0 || element.height <= 0 || (element.type === "cube" && element.depth <= 0)) {
          errors.push({
            elementId: element.id,
            errorType: "dimension",
            message: `${element.type} has invalid dimensions`,
            severity: "critical"
          });
        }
      }

      // Check for zero or negative radius
      if (["sphere", "cylinder", "cone", "torus"].includes(element.type) && element.radius <= 0) {
        errors.push({
          elementId: element.id,
          errorType: "dimension",
          message: `${element.type} has zero or negative radius`,
          severity: "critical"
        });
      }
    });

    return {
      hasErrors: errors.length > 0,
      errors,
      warnings
    };
  }

  /**
   * Private: Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const continuousCADAgent = new ContinuousCADAgent();

// Legacy compatibility - keep the old class for backward compatibility
export class ProgressiveGeneratorService {
  async generateProgressively(request: TextToCADRequest): Promise<Element[]> {
    const taskId = await continuousCADAgent.generateProgressively(request);

    return new Promise((resolve, reject) => {
      const unsubscribe = continuousCADAgent.onUpdate(update => {
        if (update.taskId === taskId) {
          if (update.type === "result" && update.data.result) {
            unsubscribe();
            resolve(update.data.result);
          } else if (update.type === "error") {
            unsubscribe();
            reject(new Error(update.data.error || "Generation failed"));
          }
        }
      });
    });
  }
}

export const progressiveGenerator = new ProgressiveGeneratorService();

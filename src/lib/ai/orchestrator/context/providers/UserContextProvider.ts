import { ApplicationContext, UserAction, UserPreferences } from "../../UnifiedAIOrchestrator";

export class UserContextProvider {
  private actionHistory: UserAction[] = [];
  private sessionStartTime: Date = new Date();
  private activityListeners: Set<(action: UserAction) => void> = new Set();

  /**
   * Get current user context including preferences and history
   */
  async getUserContext(): Promise<ApplicationContext["user"]> {
    try {
      const recentActions = this.getRecentActions();
      const preferences = await this.getUserPreferences();
      const skillLevel = this.determineSkillLevel();
      const workingStyle = this.determineWorkingStyle();

      return {
        recentActions,
        preferences,
        skillLevel,
        workingStyle
      };
    } catch (error) {
      console.error("Error getting user context:", error);
      return this.getDefaultUserContext();
    }
  }

  /**
   * Get current session context
   */
  async getSessionContext(): Promise<ApplicationContext["session"]> {
    try {
      const totalActions = this.actionHistory.length;
      const successfulOperations = this.actionHistory.filter(a => a.success).length;
      const lastAIInteraction = this.getLastAIInteraction();
      const currentGoal = this.getCurrentGoal();

      return {
        startTime: this.sessionStartTime,
        totalActions,
        successfulOperations,
        lastAIInteraction,
        currentGoal
      };
    } catch (error) {
      console.error("Error getting session context:", error);
      return this.getDefaultSessionContext();
    }
  }

  /**
   * Record user activity
   */
  recordActivity(eventType: string): void {
    try {
      const action: UserAction = {
        timestamp: new Date(),
        type: this.mapEventToActionType(eventType),
        target: eventType,
        success: true,
        context: {
          eventType,
          source: "activity_monitor"
        }
      };

      this.addAction(action);
    } catch (error) {
      console.error("Error recording activity:", error);
    }
  }

  /**
   * Record specific actions
   */
  recordActions(actions: any[]): void {
    try {
      for (const actionData of actions) {
        const action: UserAction = {
          timestamp: new Date(),
          type: actionData.type || "ai_query",
          target: actionData.description || "AI Action",
          success: true,
          context: actionData
        };

        this.addAction(action);
      }
    } catch (error) {
      console.error("Error recording actions:", error);
    }
  }

  /**
   * Add action listener
   */
  addActionListener(listener: (action: UserAction) => void): () => void {
    this.activityListeners.add(listener);

    return () => {
      this.activityListeners.delete(listener);
    };
  }

  /**
   * Get recent actions (last 10)
   */
  private getRecentActions(): UserAction[] {
    return this.actionHistory.slice(-10);
  }

  /**
   * Get user preferences from various sources
   */
  private async getUserPreferences(): Promise<UserPreferences> {
    try {
      // Try to get from localStorage first
      const storedPrefs = await this.getStoredPreferences();
      if (storedPrefs) {
        return storedPrefs;
      }

      // Try to get from URL parameters
      const urlPrefs = this.getPreferencesFromURL();
      if (urlPrefs) {
        return { ...this.getDefaultPreferences(), ...urlPrefs };
      }

      // Try to get from user settings UI
      const uiPrefs = this.getPreferencesFromUI();
      if (uiPrefs) {
        return { ...this.getDefaultPreferences(), ...uiPrefs };
      }

      return this.getDefaultPreferences();
    } catch (error) {
      console.error("Error getting user preferences:", error);
      return this.getDefaultPreferences();
    }
  }

  /**
   * Get stored preferences from localStorage
   */
  private async getStoredPreferences(): Promise<UserPreferences | null> {
    try {
      if (typeof window === "undefined") {
        return null;
      }

      const stored = localStorage.getItem("cad_user_preferences");
      if (stored) {
        const parsed = JSON.parse(stored);

        // Validate the parsed preferences
        if (this.validatePreferences(parsed)) {
          return parsed;
        }
      }

      return null;
    } catch (error) {
      console.error("Error getting stored preferences:", error);
      return null;
    }
  }

  /**
   * Get preferences from URL parameters
   */
  private getPreferencesFromURL(): Partial<UserPreferences> | null {
    try {
      if (typeof window === "undefined") {
        return null;
      }

      const params = new URLSearchParams(window.location.search);
      const prefs: Partial<UserPreferences> = {};

      const model = params.get("model");
      if (model) {
        prefs.preferredModel = model as any;
      }

      const style = params.get("style");
      if (style) {
        prefs.responseStyle = style as any;
      }

      const complexity = params.get("complexity");
      if (complexity) {
        prefs.complexityLevel = complexity as any;
      }

      const language = params.get("lang");
      if (language) {
        prefs.language = language as any;
      }

      return Object.keys(prefs).length > 0 ? prefs : null;
    } catch (error) {
      console.error("Error getting preferences from URL:", error);
      return null;
    }
  }

  /**
   * Get preferences from UI elements
   */
  private getPreferencesFromUI(): Partial<UserPreferences> | null {
    try {
      if (typeof window === "undefined") {
        return null;
      }

      const prefs: Partial<UserPreferences> = {};

      // Check model selector
      const modelSelector = document.querySelector('[data-setting="model"]') as HTMLSelectElement;
      if (modelSelector && modelSelector.value) {
        prefs.preferredModel = modelSelector.value as any;
      }

      // Check response style
      const styleSelector = document.querySelector('[data-setting="responseStyle"]') as HTMLSelectElement;
      if (styleSelector && styleSelector.value) {
        prefs.responseStyle = styleSelector.value as any;
      }

      // Check complexity level
      const complexitySelector = document.querySelector('[data-setting="complexity"]') as HTMLSelectElement;
      if (complexitySelector && complexitySelector.value) {
        prefs.complexityLevel = complexitySelector.value as any;
      }

      // Check language
      const languageSelector = document.querySelector('[data-setting="language"]') as HTMLSelectElement;
      if (languageSelector && languageSelector.value) {
        prefs.language = languageSelector.value as any;
      }

      // Check auto suggestions toggle
      const autoSuggestionsToggle = document.querySelector('[data-setting="autoSuggestions"]') as HTMLInputElement;
      if (autoSuggestionsToggle) {
        prefs.autoSuggestions = autoSuggestionsToggle.checked;
      }

      // Check context sensitivity
      const contextSensitivitySelector = document.querySelector(
        '[data-setting="contextSensitivity"]'
      ) as HTMLSelectElement;
      if (contextSensitivitySelector && contextSensitivitySelector.value) {
        prefs.contextSensitivity = contextSensitivitySelector.value as any;
      }

      return Object.keys(prefs).length > 0 ? prefs : null;
    } catch (error) {
      console.error("Error getting preferences from UI:", error);
      return null;
    }
  }

  /**
   * Determine user skill level based on actions and behavior
   */
  private determineSkillLevel(): ApplicationContext["user"]["skillLevel"] {
    try {
      if (this.actionHistory.length < 10) {
        return "beginner";
      }

      const successRate = this.actionHistory.filter(a => a.success).length / this.actionHistory.length;
      const complexActions = this.actionHistory.filter(
        a => a.type === "optimize" || a.target.includes("advanced") || a.target.includes("complex")
      ).length;

      const recentActions = this.actionHistory.slice(-20);
      const varietyScore = new Set(recentActions.map(a => a.type)).size;

      if (successRate > 0.9 && complexActions > 10 && varietyScore > 4) {
        return "expert";
      } else if (successRate > 0.8 && complexActions > 5 && varietyScore > 3) {
        return "advanced";
      } else if (successRate > 0.7 && this.actionHistory.length > 50) {
        return "intermediate";
      }

      return "beginner";
    } catch (error) {
      console.error("Error determining skill level:", error);
      return "intermediate";
    }
  }

  /**
   * Determine user working style
   */
  private determineWorkingStyle(): ApplicationContext["user"]["workingStyle"] {
    try {
      if (this.actionHistory.length < 5) {
        return "systematic";
      }

      const recentActions = this.actionHistory.slice(-20);

      // Count different types of actions
      const analyzeActions = recentActions.filter(a => a.type === "analyze").length;
      const createActions = recentActions.filter(a => a.type === "create").length;
      const modifyActions = recentActions.filter(a => a.type === "modify").length;

      // Calculate action patterns
      const explorationScore = (createActions + modifyActions) / recentActions.length;
      const analysisScore = analyzeActions / recentActions.length;

      // Check for quick successive actions (efficiency-focused)
      const timeGaps = recentActions
        .slice(1)
        .map((action, i) => action.timestamp.getTime() - recentActions[i].timestamp.getTime());
      const avgTimeGap = timeGaps.reduce((sum, gap) => sum + gap, 0) / timeGaps.length;

      if (avgTimeGap < 10000 && explorationScore < 0.3) {
        // Less than 10 seconds between actions
        return "efficiency-focused";
      } else if (explorationScore > 0.6) {
        return "explorative";
      } else if (analysisScore > 0.3) {
        return "systematic";
      }

      return "systematic";
    } catch (error) {
      console.error("Error determining working style:", error);
      return "systematic";
    }
  }

  /**
   * Get last AI interaction timestamp
   */
  private getLastAIInteraction(): Date | undefined {
    const aiActions = this.actionHistory.filter(
      a => a.type === "ai_query" || a.target.includes("AI") || a.context?.source === "ai"
    );

    return aiActions.length > 0 ? aiActions[aiActions.length - 1].timestamp : undefined;
  }

  /**
   * Get current user goal if detectable
   */
  private getCurrentGoal(): string | undefined {
    try {
      const recentActions = this.actionHistory.slice(-5);

      // Look for patterns that suggest a goal
      const createCount = recentActions.filter(a => a.type === "create").length;
      const analyzeCount = recentActions.filter(a => a.type === "analyze").length;
      const optimizeCount = recentActions.filter(a => a.type === "optimize").length;

      if (createCount >= 3) {
        return "Building a new design";
      } else if (analyzeCount >= 2) {
        return "Analyzing existing design";
      } else if (optimizeCount >= 1) {
        return "Optimizing for production";
      }

      // Check for export-related actions
      const exportActions = recentActions.filter(
        a => a.type === "export" || a.target.includes("export") || a.target.includes("download")
      );

      if (exportActions.length > 0) {
        return "Preparing for export";
      }

      return undefined;
    } catch (error) {
      console.error("Error getting current goal:", error);
      return undefined;
    }
  }

  /**
   * Add action to history
   */
  private addAction(action: UserAction): void {
    this.actionHistory.push(action);

    // Limit history size
    if (this.actionHistory.length > 1000) {
      this.actionHistory = this.actionHistory.slice(-500);
    }

    // Notify listeners
    this.activityListeners.forEach(listener => {
      try {
        listener(action);
      } catch (error) {
        console.error("Error in activity listener:", error);
      }
    });

    // Save to localStorage periodically
    if (this.actionHistory.length % 10 === 0) {
      this.saveActionHistory();
    }
  }

  /**
   * Map event type to action type
   */
  private mapEventToActionType(eventType: string): UserAction["type"] {
    switch (eventType) {
      case "click":
        return "modify";
      case "keydown":
        return "modify";
      case "scroll":
        return "analyze";
      default:
        return "modify";
    }
  }

  /**
   * Validate preferences object
   */
  private validatePreferences(prefs: any): prefs is UserPreferences {
    try {
      return (
        typeof prefs === "object" &&
        prefs !== null &&
        (!prefs.preferredModel || typeof prefs.preferredModel === "string") &&
        (!prefs.responseStyle || typeof prefs.responseStyle === "string") &&
        (!prefs.complexityLevel || typeof prefs.complexityLevel === "string") &&
        (!prefs.language || ["en", "it", "es", "fr"].includes(prefs.language)) &&
        (!prefs.autoSuggestions || typeof prefs.autoSuggestions === "boolean") &&
        (!prefs.contextSensitivity || ["high", "medium", "low"].includes(prefs.contextSensitivity))
      );
    } catch (error) {
      console.error("Error validating preferences:", error);
      return false;
    }
  }

  /**
   * Get default preferences
   */
  private getDefaultPreferences(): UserPreferences {
    return {
      preferredModel: "claude-sonnet-4-20250514",
      responseStyle: "detailed",
      complexityLevel: "moderate",
      language: "en",
      autoSuggestions: true,
      contextSensitivity: "high"
    };
  }

  /**
   * Get default user context
   */
  private getDefaultUserContext(): ApplicationContext["user"] {
    return {
      recentActions: [],
      preferences: this.getDefaultPreferences(),
      skillLevel: "intermediate",
      workingStyle: "systematic"
    };
  }

  /**
   * Get default session context
   */
  private getDefaultSessionContext(): ApplicationContext["session"] {
    return {
      startTime: this.sessionStartTime,
      totalActions: 0,
      successfulOperations: 0,
      lastAIInteraction: undefined,
      currentGoal: undefined
    };
  }

  /**
   * Save action history to localStorage
   */
  private saveActionHistory(): void {
    try {
      if (typeof window !== "undefined") {
        // Save only recent actions to avoid storage bloat
        const recentActions = this.actionHistory.slice(-100);
        localStorage.setItem("cad_action_history", JSON.stringify(recentActions));
      }
    } catch (error) {
      console.error("Error saving action history:", error);
    }
  }

  /**
   * Load action history from localStorage
   */
  loadActionHistory(): void {
    try {
      if (typeof window !== "undefined") {
        const stored = localStorage.getItem("cad_action_history");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            this.actionHistory = parsed.map(action => ({
              ...action,
              timestamp: new Date(action.timestamp)
            }));
          }
        }
      }
    } catch (error) {
      console.error("Error loading action history:", error);
    }
  }
}

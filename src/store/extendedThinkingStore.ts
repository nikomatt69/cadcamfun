import { create } from "zustand";
import { persist } from "zustand/middleware";
import { ThinkingStep, ThinkingSession, ThinkingDepth } from "@/src/types/AITypes";

interface ExtendedThinkingState {
  // Current thinking process
  currentThinking?: ThinkingSession;
  isThinking: boolean;

  // History and memory
  thinkingHistory: ThinkingSession[];
  maxHistorySize: number;

  // UI State
  showThinkingDropdown: boolean;
  expandedSteps: Set<string>;
  selectedThinkingId: string | null;

  // Settings
  thinkingDepth: ThinkingDepth;
  autoShowThinking: boolean;
  enableRealTimeThinking: boolean;
  thinkingSpeed: "slow" | "normal" | "fast";

  // Analytics
  totalThinkingTime: number;
  averageConfidence: number;
  mostUsedConcepts: Record<string, number>;

  // Actions
  startThinking: (userQuery: string, context: string) => void;
  addThinkingStep: (step: Omit<ThinkingStep, "id" | "timestamp">) => void;
  completeThinking: (summary: string, outcome: ThinkingSession["outcome"]) => void;
  interruptThinking: () => void;

  // UI Actions
  toggleThinkingDropdown: () => void;
  setThinkingDropdown: (show: boolean) => void;
  expandStep: (stepId: string) => void;
  collapseStep: (stepId: string) => void;
  selectThinking: (thinkingId: string | null) => void;

  // Settings Actions
  setThinkingDepth: (depth: ThinkingDepth) => void;
  setAutoShowThinking: (auto: boolean) => void;
  setRealTimeThinking: (enabled: boolean) => void;
  setThinkingSpeed: (speed: "slow" | "normal" | "fast") => void;

  // History Actions
  clearHistory: () => void;
  removeThinking: (thinkingId: string) => void;
  exportThinking: (thinkingId: string) => string;

  // Analytics Actions
  updateAnalytics: () => void;
  getThinkingInsights: () => Record<string, any>;
}

// Helper function to generate unique IDs
const generateId = () => "thinking_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);

// Helper function to calculate confidence
const calculateOverallConfidence = (steps: ThinkingStep[]): number => {
  if (steps.length === 0) return 0;
  const sum = steps.reduce((acc, step) => acc + step.confidence, 0);
  return Math.round((sum / steps.length) * 100) / 100;
};

// Helper to extract concepts from thinking content
const extractConcepts = (content: string): string[] => {
  // Simple concept extraction - in production, you'd use NLP
  const concepts = content.toLowerCase().match(/\b[a-zA-Z]{4,}\b/g) || [];

  return Array.from(new Set(concepts))
    .filter(concept => !["this", "that", "with", "from", "they", "would", "could", "should"].includes(concept))
    .slice(0, 5);
};

export const useExtendedThinkingStore = create<ExtendedThinkingState>()(
  persist(
    (set, get) => ({
      // Initial state
      currentThinking: undefined,
      isThinking: false,
      thinkingHistory: [],
      maxHistorySize: 100,

      // UI State
      showThinkingDropdown: false,
      expandedSteps: new Set(),
      selectedThinkingId: null,

      // Settings
      thinkingDepth: "medium",
      autoShowThinking: true,
      enableRealTimeThinking: true,
      thinkingSpeed: "normal",

      // Analytics
      totalThinkingTime: 0,
      averageConfidence: 0,
      mostUsedConcepts: {},

      // Actions
      startThinking: (userQuery: string, context: string) => {
        const thinkingSession: ThinkingSession = {
          id: generateId(),
          timestamp: new Date(),
          context,
          userQuery,
          steps: [],
          summary: "",
          confidence: 0,
          totalDuration: 0,
          mcpToolsUsed: [],
          outcome: "completed",
          tags: []
        };

        set({
          currentThinking: thinkingSession,
          isThinking: true,
          showThinkingDropdown: get().autoShowThinking
        });
      },

      addThinkingStep: stepData => {
        const currentThinking = get().currentThinking;
        if (!currentThinking) return;

        const step: ThinkingStep = {
          ...stepData,
          id: generateId(),
          timestamp: new Date(),
          relatedConcepts: stepData.relatedConcepts || extractConcepts(stepData.content)
        };

        const updatedThinking = {
          ...currentThinking,
          steps: [...currentThinking.steps, step],
          confidence: calculateOverallConfidence([...currentThinking.steps, step])
        };

        set({
          currentThinking: updatedThinking
        });

        // Update analytics
        get().updateAnalytics();
      },

      completeThinking: (summary: string, outcome: ThinkingSession["outcome"] = "completed") => {
        const currentThinking = get().currentThinking;
        if (!currentThinking) return;

        const completedThinking: ThinkingSession = {
          ...currentThinking,
          summary,
          outcome,
          totalDuration: Date.now() - currentThinking.timestamp.getTime(),
          confidence: calculateOverallConfidence(currentThinking.steps)
        };

        set(state => ({
          currentThinking: undefined,
          isThinking: false,
          thinkingHistory: [completedThinking, ...state.thinkingHistory].slice(0, state.maxHistorySize),
          totalThinkingTime: state.totalThinkingTime + completedThinking.totalDuration
        }));

        get().updateAnalytics();
      },

      interruptThinking: () => {
        const currentThinking = get().currentThinking;
        if (currentThinking) {
          get().completeThinking("Thinking process interrupted", "interrupted");
        }
      },

      // UI Actions
      toggleThinkingDropdown: () => {
        set(state => ({
          showThinkingDropdown: !state.showThinkingDropdown
        }));
      },

      setThinkingDropdown: (show: boolean) => {
        set({ showThinkingDropdown: show });
      },

      expandStep: (stepId: string) => {
        set(state => ({
          expandedSteps: new Set([...Array.from(state.expandedSteps), stepId])
        }));
      },

      collapseStep: (stepId: string) => {
        set(state => {
          const newExpanded = new Set(state.expandedSteps);
          newExpanded.delete(stepId);
          return { expandedSteps: newExpanded };
        });
      },

      selectThinking: (thinkingId: string | null) => {
        set({ selectedThinkingId: thinkingId });
      },

      // Settings Actions
      setThinkingDepth: (depth: ThinkingDepth) => {
        set({ thinkingDepth: depth });
      },

      setAutoShowThinking: (auto: boolean) => {
        set({ autoShowThinking: auto });
      },

      setRealTimeThinking: (enabled: boolean) => {
        set({ enableRealTimeThinking: enabled });
      },

      setThinkingSpeed: (speed: "slow" | "normal" | "fast") => {
        set({ thinkingSpeed: speed });
      },

      // History Actions
      clearHistory: () => {
        set({
          thinkingHistory: [],
          totalThinkingTime: 0,
          averageConfidence: 0,
          mostUsedConcepts: {}
        });
      },

      removeThinking: (thinkingId: string) => {
        set(state => ({
          thinkingHistory: state.thinkingHistory.filter(t => t.id !== thinkingId),
          selectedThinkingId: state.selectedThinkingId === thinkingId ? null : state.selectedThinkingId
        }));
      },

      exportThinking: (thinkingId: string) => {
        const thinking = get().thinkingHistory.find(t => t.id === thinkingId);
        if (!thinking) return "";

        return JSON.stringify(thinking, null, 2);
      },

      // Analytics Actions
      updateAnalytics: () => {
        const { thinkingHistory, currentThinking } = get();
        const allThinking = currentThinking ? [currentThinking, ...thinkingHistory] : thinkingHistory;

        if (allThinking.length === 0) return;

        // Calculate average confidence
        const totalConfidence = allThinking.reduce((sum, t) => sum + t.confidence, 0);
        const averageConfidence = totalConfidence / allThinking.length;

        // Count most used concepts
        const conceptCounts: Record<string, number> = {};
        allThinking.forEach(thinking => {
          thinking.steps.forEach(step => {
            step.relatedConcepts.forEach(concept => {
              conceptCounts[concept] = (conceptCounts[concept] || 0) + 1;
            });
          });
        });

        set({
          averageConfidence: Math.round(averageConfidence * 100) / 100,
          mostUsedConcepts: conceptCounts
        });
      },

      getThinkingInsights: () => {
        const state = get();
        const { thinkingHistory, totalThinkingTime, averageConfidence, mostUsedConcepts } = state;

        return {
          totalSessions: thinkingHistory.length,
          totalThinkingTime,
          averageThinkingTime: thinkingHistory.length > 0 ? totalThinkingTime / thinkingHistory.length : 0,
          averageConfidence,
          mostUsedConcepts: Object.entries(mostUsedConcepts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 10)
            .reduce((obj, [concept, count]) => ({ ...obj, [concept]: count }), {}),
          thinkingTypeDistribution: thinkingHistory.reduce(
            (acc, thinking) => {
              thinking.steps.forEach(step => {
                acc[step.type] = (acc[step.type] || 0) + 1;
              });
              return acc;
            },
            {} as Record<string, number>
          ),
          completionRate:
            thinkingHistory.length > 0
              ? thinkingHistory.filter(t => t.outcome === "completed").length / thinkingHistory.length
              : 0
        };
      }
    }),
    {
      name: "extended-thinking-store",
      partialize: state => ({
        thinkingHistory: state.thinkingHistory.slice(0, 50), // Persist only last 50
        thinkingDepth: state.thinkingDepth,
        autoShowThinking: state.autoShowThinking,
        enableRealTimeThinking: state.enableRealTimeThinking,
        thinkingSpeed: state.thinkingSpeed,
        totalThinkingTime: state.totalThinkingTime,
        averageConfidence: state.averageConfidence,
        mostUsedConcepts: state.mostUsedConcepts
      })
    }
  )
);

// Hook conveniences
export const useThinkingProcess = () => {
  const store = useExtendedThinkingStore();
  return {
    currentThinking: store.currentThinking,
    isThinking: store.isThinking,
    startThinking: store.startThinking,
    addStep: store.addThinkingStep,
    completeThinking: store.completeThinking,
    interruptThinking: store.interruptThinking
  };
};

export const useThinkingUI = () => {
  const store = useExtendedThinkingStore();
  return {
    showDropdown: store.showThinkingDropdown,
    expandedSteps: store.expandedSteps,
    toggleDropdown: store.toggleThinkingDropdown,
    setDropdown: store.setThinkingDropdown,
    expandStep: store.expandStep,
    collapseStep: store.collapseStep
  };
};

export const useThinkingHistory = () => {
  const store = useExtendedThinkingStore();
  return {
    history: store.thinkingHistory,
    selectedId: store.selectedThinkingId,
    selectThinking: store.selectThinking,
    removeThinking: store.removeThinking,
    exportThinking: store.exportThinking,
    clearHistory: store.clearHistory
  };
};

export const useThinkingSettings = () => {
  const store = useExtendedThinkingStore();
  return {
    depth: store.thinkingDepth,
    autoShow: store.autoShowThinking,
    realTime: store.enableRealTimeThinking,
    speed: store.thinkingSpeed,
    setDepth: store.setThinkingDepth,
    setAutoShow: store.setAutoShowThinking,
    setRealTime: store.setRealTimeThinking,
    setSpeed: store.setThinkingSpeed
  };
};

export const useThinkingAnalytics = () => {
  const store = useExtendedThinkingStore();
  return {
    insights: store.getThinkingInsights(),
    updateAnalytics: store.updateAnalytics
  };
};

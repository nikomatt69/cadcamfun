import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { ConstraintEngine } from "../lib/constraints/ConstraintEngine";
import { Constraint, ParametricParameter } from "../types/constraints";

interface ConstraintContextType {
  constraintEngine: ConstraintEngine;
  addConstraint: (constraint: Omit<Constraint, "id">) => string;
  updateConstraint: (id: string, updates: Partial<Constraint>) => boolean;
  removeConstraint: (id: string) => boolean;
  getConstraintsForEntity: (entityId: string) => Constraint[];
  addParameter: (parameter: Omit<ParametricParameter, "id">) => string;
  updateParameter: (id: string, value: number) => boolean;
  getAllParameters: () => ParametricParameter[];
}

const ConstraintContext = createContext<ConstraintContextType | null>(null);

interface ConstraintProviderProps {
  children: ReactNode;
}

/**
 * Provider component for the parametric modeling constraint system
 * Makes the constraint engine available throughout the component tree
 */
export function ConstraintProvider({ children }: ConstraintProviderProps) {
  const [engine, setEngine] = useState<ConstraintEngine | null>(null);

  // Initialize the engine on first render
  useEffect(() => {
    setEngine(new ConstraintEngine());
  }, []);

  // Only render children once engine is initialized
  if (!engine) {
    return null;
  }

  const contextValue: ConstraintContextType = {
    constraintEngine: engine,

    addConstraint: (constraint: Omit<Constraint, "id">) => {
      return engine.addConstraint(constraint);
    },

    updateConstraint: (id: string, updates: Partial<Constraint>) => {
      return engine.updateConstraint(id, updates);
    },

    removeConstraint: (id: string) => {
      return engine.removeConstraint(id);
    },

    getConstraintsForEntity: (entityId: string) => {
      return engine.getConstraintsForEntity(entityId);
    },

    addParameter: (parameter: Omit<ParametricParameter, "id">) => {
      return engine.addParameter(parameter);
    },

    updateParameter: (id: string, value: number) => {
      return engine.updateParameter(id, value);
    },

    getAllParameters: () => {
      return engine.getAllParameters();
    }
  };

  return <ConstraintContext.Provider value={contextValue}>{children}</ConstraintContext.Provider>;
}

/**
 * Hook to use the constraint context
 */
export function useConstraints() {
  const context = useContext(ConstraintContext);

  if (!context) {
    throw new Error("useConstraints must be used within a ConstraintProvider");
  }

  return context;
}

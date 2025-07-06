import { v4 as uuidv4 } from "uuid";
import {
  Constraint,
  ConstraintType,
  ParametricParameter,
  ParametricEquation,
  ConstraintHistoryEntry
} from "../../types/constraints";

/**
 * Core constraint engine responsible for managing and solving parametric constraints
 */
export class ConstraintEngine {
  private constraints: Map<string, Constraint> = new Map();
  private parameters: Map<string, ParametricParameter> = new Map();
  private equations: Map<string, ParametricEquation> = new Map();
  private history: ConstraintHistoryEntry[] = [];

  // Track dependencies between entities and constraints
  private entityConstraintMap: Map<string, Set<string>> = new Map();

  constructor() {
    // Initialize engine
  }

  /**
   * Add a new constraint to the system
   */
  public addConstraint(constraint: Omit<Constraint, "id">): string {
    const id = uuidv4();
    const newConstraint = { ...constraint, id, active: true } as Constraint;

    this.constraints.set(id, newConstraint);

    // Update entity-constraint mapping
    newConstraint.entityIds.forEach(entityId => {
      if (!this.entityConstraintMap.has(entityId)) {
        this.entityConstraintMap.set(entityId, new Set());
      }
      this.entityConstraintMap.get(entityId)?.add(id);
    });

    // Add to history
    this.addHistoryEntry({
      id: uuidv4(),
      timestamp: Date.now(),
      constraintId: id,
      type: "add",
      newState: newConstraint
    });

    // Solve constraints after adding
    this.solve();

    return id;
  }

  /**
   * Update an existing constraint
   */
  public updateConstraint(id: string, updates: Partial<Constraint>): boolean {
    const constraint = this.constraints.get(id);
    if (!constraint) return false;

    const previousState = { ...constraint };
    const updatedConstraint = { ...constraint, ...updates };

    this.constraints.set(id, updatedConstraint);

    // Update entity-constraint mapping if entityIds changed
    if (updates.entityIds) {
      // Remove old mappings
      constraint.entityIds.forEach(entityId => {
        const constraintSet = this.entityConstraintMap.get(entityId);
        if (constraintSet) {
          constraintSet.delete(id);
          if (constraintSet.size === 0) {
            this.entityConstraintMap.delete(entityId);
          }
        }
      });

      // Add new mappings
      updatedConstraint.entityIds.forEach(entityId => {
        if (!this.entityConstraintMap.has(entityId)) {
          this.entityConstraintMap.set(entityId, new Set());
        }
        this.entityConstraintMap.get(entityId)?.add(id);
      });
    }

    // Add to history
    this.addHistoryEntry({
      id: uuidv4(),
      timestamp: Date.now(),
      constraintId: id,
      type: "modify",
      previousState,
      newState: updatedConstraint
    });

    // Solve constraints after updating
    this.solve();

    return true;
  }

  /**
   * Remove a constraint from the system
   */
  public removeConstraint(id: string): boolean {
    const constraint = this.constraints.get(id);
    if (!constraint) return false;

    // Remove from entity-constraint mapping
    constraint.entityIds.forEach(entityId => {
      const constraintSet = this.entityConstraintMap.get(entityId);
      if (constraintSet) {
        constraintSet.delete(id);
        if (constraintSet.size === 0) {
          this.entityConstraintMap.delete(entityId);
        }
      }
    });

    this.constraints.delete(id);

    // Add to history
    this.addHistoryEntry({
      id: uuidv4(),
      timestamp: Date.now(),
      constraintId: id,
      type: "remove",
      previousState: constraint
    });

    // Solve constraints after removal
    this.solve();

    return true;
  }

  /**
   * Get all constraints that affect a specific entity
   */
  public getConstraintsForEntity(entityId: string): Constraint[] {
    const constraintIds = this.entityConstraintMap.get(entityId);
    if (!constraintIds) return [];

    return Array.from(constraintIds)
      .map(id => this.constraints.get(id))
      .filter(Boolean) as Constraint[];
  }

  /**
   * Add a parametric parameter to the system
   */
  public addParameter(parameter: Omit<ParametricParameter, "id">): string {
    const id = uuidv4();
    const newParameter = { ...parameter, id, constraints: [] };

    this.parameters.set(id, newParameter);
    return id;
  }

  /**
   * Update a parameter value and propagate changes through constraints
   */
  public updateParameter(id: string, value: number): boolean {
    const parameter = this.parameters.get(id);
    if (!parameter) return false;

    // Check bounds if they exist
    if (parameter.min !== undefined && value < parameter.min) {
      value = parameter.min;
    }
    if (parameter.max !== undefined && value > parameter.max) {
      value = parameter.max;
    }

    // Update parameter
    this.parameters.set(id, { ...parameter, value });

    // Update any dependent parameters through equations
    this.solveEquations();

    // Solve constraints after parameter update
    this.solve();

    return true;
  }

  /**
   * Add an equation that relates parameters
   */
  public addEquation(equation: Omit<ParametricEquation, "id">): string {
    const id = uuidv4();
    this.equations.set(id, { ...equation, id });

    // Solve the equation immediately
    this.solveEquation(id);

    return id;
  }

  /**
   * Solve all parametric equations in the system
   */
  private solveEquations(): void {
    // For simplicity, we're just doing a simple iteration here
    // A real implementation would need topological sorting of dependencies

    const equations = Array.from(this.equations.values());

    // Simple solve - just evaluate each equation once
    // This doesn't handle circular dependencies properly
    equations.forEach(equation => {
      this.solveEquation(equation.id);
    });
  }

  /**
   * Solve a specific equation
   */
  private solveEquation(equationId: string): boolean {
    const equation = this.equations.get(equationId);
    if (!equation) return false;

    const resultParam = this.parameters.get(equation.resultParameterId);
    if (!resultParam) return false;

    try {
      // This is a simplified equation solver
      // In a real app, you'd want to use a proper expression evaluator

      // Create a scope with parameter values
      const scope: Record<string, number> = {};

      equation.dependencies.forEach(depId => {
        const param = this.parameters.get(depId);
        if (param) {
          scope[depId] = param.value;
        }
      });

      // Simple evaluation for demo purposes
      // In a real implementation, use a library like math.js
      const result = this.evaluateExpression(equation.expression, scope);

      // Update the result parameter
      this.parameters.set(equation.resultParameterId, {
        ...resultParam,
        value: result
      });

      return true;
    } catch (error) {
      console.error("Error solving equation:", error);
      return false;
    }
  }

  /**
   * Very simple expression evaluator for demo purposes
   * In a real app, use a proper math expression library
   */
  private evaluateExpression(expression: string, scope: Record<string, number>): number {
    // Replace parameter IDs with their values
    let evalString = expression;
    Object.entries(scope).forEach(([id, value]) => {
      evalString = evalString.replace(new RegExp(id, "g"), value.toString());
    });

    // Unsafe but simple for demo
    // eslint-disable-next-line no-eval
    return eval(evalString);
  }

  /**
   * Main constraint solving algorithm
   * This is a simplified version; a real solver would be more complex
   */
  public solve(): boolean {
    // Get all active constraints sorted by priority
    const activeConstraints = Array.from(this.constraints.values())
      .filter(c => c.active)
      .sort((a, b) => b.priority - a.priority);

    // Group constraints by type
    const geometricConstraints = activeConstraints.filter(c =>
      Object.values([
        ConstraintType.COINCIDENT,
        ConstraintType.PARALLEL,
        ConstraintType.PERPENDICULAR,
        ConstraintType.TANGENT,
        ConstraintType.HORIZONTAL,
        ConstraintType.VERTICAL
      ]).includes(c.type)
    );

    const dimensionalConstraints = activeConstraints.filter(c =>
      Object.values([
        ConstraintType.DISTANCE,
        ConstraintType.ANGLE,
        ConstraintType.RADIUS,
        ConstraintType.DIAMETER
      ]).includes(c.type)
    );

    // In a real implementation, this would integrate with the CAD system's
    // underlying geometric solver, applying constraints to the actual geometry

    // First solve geometric constraints
    const geometricSolved = this.solveGeometricConstraints(geometricConstraints);

    // Then solve dimensional constraints
    const dimensionalSolved = this.solveDimensionalConstraints(dimensionalConstraints);

    return geometricSolved && dimensionalSolved;
  }

  /**
   * Solve geometric constraints
   * In a real implementation, this would integrate with a geometric constraint solver
   */
  private solveGeometricConstraints(constraints: Constraint[]): boolean {
    // This is where the actual geometric constraint solving would happen
    // For example, making lines parallel, points coincident, etc.

    // For this demo, we'll just pretend it worked
    return true;
  }

  /**
   * Solve dimensional constraints
   * In a real implementation, this would integrate with a dimensional constraint solver
   */
  private solveDimensionalConstraints(constraints: Constraint[]): boolean {
    // This is where the actual dimensional constraint solving would happen
    // For example, setting distances, angles, radii, etc.

    // For this demo, we'll just pretend it worked
    return true;
  }

  /**
   * Add an entry to the constraint history
   */
  private addHistoryEntry(entry: ConstraintHistoryEntry): void {
    this.history.push(entry);

    // Limit history size if needed
    if (this.history.length > 1000) {
      this.history = this.history.slice(-1000);
    }
  }

  /**
   * Get constraint history for timeline visualization
   */
  public getHistory(): ConstraintHistoryEntry[] {
    return [...this.history];
  }

  /**
   * Get all constraints in the system
   */
  public getAllConstraints(): Constraint[] {
    return Array.from(this.constraints.values());
  }

  /**
   * Get all parameters in the system
   */
  public getAllParameters(): ParametricParameter[] {
    return Array.from(this.parameters.values());
  }
}

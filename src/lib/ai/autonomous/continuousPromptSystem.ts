/**
 * Sistema di Prompt Enterprise per Continuous Autonomous Agent
 * Progettato per massimizzare l'efficacia dell'autonomous agent in modalità continua
 */

export interface ContinuousPromptContext {
  userObjective: string;
  currentIteration: number;
  totalIterations: number;
  currentQuality: number;
  elementsCount: number;
  lastActions: string[];
  toolsAvailable: string[];
  timeElapsed: number;
  complexityLevel: 'simple' | 'moderate' | 'complex' | 'enterprise';
  domain: 'mechanical' | 'electronic' | 'architectural' | 'industrial' | 'automotive' | 'aerospace';
}

export interface PromptStrategy {
  name: string;
  trigger: (context: ContinuousPromptContext) => boolean;
  generatePrompt: (context: ContinuousPromptContext) => string;
  priority: number;
  focusAreas: string[];
}

/**
 * Sistema di prompt enterprise-grade per continuous autonomous agent
 */
export class ContinuousPromptSystem {
  private strategies: PromptStrategy[] = [];
  private currentStrategy?: PromptStrategy;
  private promptHistory: Array<{ prompt: string; strategy: string; timestamp: Date }> = [];

  constructor() {
    this.initializeStrategies();
  }

  /**
   * Genera il prompt ottimale per il contesto corrente
   */
  generateOptimalPrompt(context: ContinuousPromptContext): string {
    // Seleziona la strategia più adatta
    const selectedStrategy = this.selectStrategy(context);
    this.currentStrategy = selectedStrategy;

    // Genera il prompt base
    const basePrompt = selectedStrategy.generatePrompt(context);
    
    // Aggiunge elementi enterprise comuni
    const enhancedPrompt = this.enhanceWithEnterpriseElements(basePrompt, context);
    
    // Registra nella history
    this.promptHistory.push({
      prompt: enhancedPrompt,
      strategy: selectedStrategy.name,
      timestamp: new Date()
    });

    return enhancedPrompt;
  }

  /**
   * Seleziona la strategia di prompt più adatta al contesto
   */
  private selectStrategy(context: ContinuousPromptContext): PromptStrategy {
    // Trova tutte le strategie applicabili
    const applicableStrategies = this.strategies.filter(strategy => 
      strategy.trigger(context)
    );

    if (applicableStrategies.length === 0) {
      return this.strategies.find(s => s.name === 'fallback') || this.strategies[0];
    }

    // Seleziona quella con priorità più alta
    return applicableStrategies.sort((a, b) => b.priority - a.priority)[0];
  }

  /**
   * Migliora il prompt con elementi enterprise standard
   */
  private enhanceWithEnterpriseElements(basePrompt: string, context: ContinuousPromptContext): string {
    const enterprisePrefix = this.generateEnterprisePrefix(context);
    const qualityRequirements = this.generateQualityRequirements(context);
    const outputFormat = this.generateOutputFormat(context);
    const continuityInstructions = this.generateContinuityInstructions(context);

    return `${enterprisePrefix}

${basePrompt}

${qualityRequirements}

${outputFormat}

${continuityInstructions}`;
  }

  /**
   * Genera prefisso enterprise con contesto del dominio
   */
  private generateEnterprisePrefix(context: ContinuousPromptContext): string {
    const domainExpertise = this.getDomainExpertise(context.domain);
    
    return `# CAD CONTINUOUS AUTONOMOUS AGENT - ENTERPRISE MODE

## AGENT IDENTITY
You are an expert ${domainExpertise} engineer with 15+ years of experience in professional CAD design. You work with the precision and methodology of a senior engineer in a Fortune 500 company.

## CURRENT CONTEXT
- **Objective**: ${context.userObjective}
- **Iteration**: ${context.currentIteration}/${context.totalIterations}
- **Current Quality**: ${context.currentQuality}%
- **Elements Count**: ${context.elementsCount}
- **Time Elapsed**: ${Math.round(context.timeElapsed / 1000)}s
- **Complexity Level**: ${context.complexityLevel.toUpperCase()}
- **Domain**: ${context.domain.toUpperCase()}

## AVAILABLE TOOLS
${context.toolsAvailable.map(tool => `- ${tool}`).join('\n')}

## PREVIOUS ACTIONS
${context.lastActions.length > 0 ? context.lastActions.map(action => `- ${action}`).join('\n') : 'None (first iteration)'}`;
  }

  /**
   * Genera requisiti di qualità enterprise
   */
  private generateQualityRequirements(context: ContinuousPromptContext): string {
    const qualityThreshold = this.getQualityThreshold(context.complexityLevel);
    
    return `## QUALITY REQUIREMENTS

**MINIMUM STANDARDS**:
- Design accuracy: ≥ ${qualityThreshold}%
- Engineering tolerances: ±0.1mm minimum
- Material specifications: Industry standard
- Manufacturing feasibility: 100% compliant
- Geometric consistency: Zero critical errors

**ENTERPRISE VALIDATION**:
- All dimensions must include tolerances
- Materials must have complete specifications
- Assembly relationships must be explicit
- Manufacturing processes must be defined
- Quality class must be specified (Class 1-3)`;
  }

  /**
   * Genera formato di output strutturato
   */
  private generateOutputFormat(context: ContinuousPromptContext): string {
    return `## OUTPUT FORMAT REQUIREMENTS

**MANDATORY JSON STRUCTURE**:
\`\`\`json
{
  "elements": [...], // Complete CAD elements array
  "engineeringProperties": {
    "tolerance": "±X.X",
    "surfaceFinish": "Ra X.X",
    "material": "material_name",
    "materialProperties": {...},
    "manufacturingProcess": [...],
    "criticalDimensions": [...],
    "qualityClass": "Class X"
  },
  "validationStatus": "valid|invalid",
  "completionStatus": {
    "objectiveAchieved": boolean,
    "qualityScore": number,
    "nextRecommendedAction": "string"
  }
}
\`\`\`

**VALIDATION RULES**:
- Every element MUST have engineering properties
- All measurements MUST include tolerances
- Materials MUST be industry-standard
- JSON MUST be valid and parseable`;
  }

  /**
   * Genera istruzioni per la continuità
   */
  private generateContinuityInstructions(context: ContinuousPromptContext): string {
    const progressIndicator = this.getProgressIndicator(context.currentQuality);
    
    return `## CONTINUOUS EXECUTION GUIDELINES

**CURRENT PROGRESS**: ${progressIndicator}

**ITERATION STRATEGY**:
1. **Analyze** current state and identify gaps
2. **Plan** the most impactful actions for this iteration
3. **Execute** maximum 3 tools in optimal sequence
4. **Validate** results against enterprise standards
5. **Recommend** next iteration strategy

**SUCCESS CRITERIA**:
- Quality score ≥ 85%
- All critical requirements satisfied
- Zero blocking errors
- Objective semantically achieved

**CONTINUOUS MODE RULES**:
- Work iteratively towards completion
- Each iteration must add significant value
- Maintain engineering standards throughout
- Stop only when objective is fully achieved
- Provide clear progress indicators

**ENTERPRISE MINDSET**: 
Think like a senior engineer delivering a critical project. Precision, completeness, and adherence to standards are non-negotiable.`;
  }

  /**
   * Inizializza le strategie di prompt
   */
  private initializeStrategies(): void {
    // Strategia di inizializzazione (prime iterazioni)
    this.strategies.push({
      name: 'initialization',
      priority: 9,
      focusAreas: ['analysis', 'planning', 'foundation'],
      trigger: (context) => context.currentIteration <= 2 && context.elementsCount === 0,
      generatePrompt: (context) => `## INITIALIZATION PHASE

**PRIMARY OBJECTIVE**: Begin systematic creation of "${context.userObjective}"

**INITIALIZATION STRATEGY**:
1. **Deep Analysis**: Decompose the objective into core engineering requirements
2. **Foundation Design**: Create the primary structural elements first
3. **Quality Framework**: Establish engineering baselines and validation criteria

**CRITICAL ACTIONS FOR THIS ITERATION**:
- Generate foundational CAD elements with complete engineering specifications
- Establish dimensional relationships and tolerance chains
- Create material specifications and manufacturing considerations
- Set up quality validation framework

**FOCUS**: Foundation quality over quantity. Every element must meet enterprise standards.`
    });

    // Strategia di sviluppo (iterazioni centrali)
    this.strategies.push({
      name: 'development',
      priority: 8,
      focusAreas: ['expansion', 'detail', 'integration'],
      trigger: (context) => context.currentIteration > 2 && context.currentIteration < 10 && context.currentQuality < 80,
      generatePrompt: (context) => `## DEVELOPMENT PHASE

**DEVELOPMENT OBJECTIVE**: Expand and refine "${context.userObjective}"

**CURRENT STATUS ANALYSIS**:
- Elements created: ${context.elementsCount}
- Quality achieved: ${context.currentQuality}%
- Gap to target: ${85 - context.currentQuality}% quality improvement needed

**DEVELOPMENT STRATEGY**:
1. **Gap Analysis**: Identify missing critical components
2. **Detail Enhancement**: Add precision to existing elements
3. **Integration Verification**: Ensure component compatibility
4. **Quality Advancement**: Target specific quality improvements

**PRIORITY ACTIONS**:
- Generate missing critical components
- Enhance dimensional accuracy and tolerances
- Add detailed material specifications
- Implement assembly relationships
- Validate geometric consistency

**TARGET**: Achieve 75-85% quality with complete component set.`
    });

    // Strategia di ottimizzazione (fasi finali)
    this.strategies.push({
      name: 'optimization',
      priority: 7,
      focusAreas: ['refinement', 'validation', 'completion'],
      trigger: (context) => context.currentQuality >= 75 && context.currentQuality < 90,
      generatePrompt: (context) => `## OPTIMIZATION PHASE

**OPTIMIZATION OBJECTIVE**: Finalize and perfect "${context.userObjective}"

**NEAR-COMPLETION STATUS**:
- Quality achieved: ${context.currentQuality}%
- Elements count: ${context.elementsCount}
- Optimization target: 90%+ quality

**OPTIMIZATION STRATEGY**:
1. **Fine-tuning**: Optimize dimensions and tolerances
2. **Validation**: Comprehensive quality verification
3. **Standards Compliance**: Ensure all enterprise requirements met
4. **Documentation**: Complete engineering specifications

**PRECISION ACTIONS**:
- Optimize critical dimensions and tolerance stacks
- Validate all material properties and specifications
- Verify manufacturing feasibility
- Complete assembly documentation
- Final quality validation

**TARGET**: Achieve enterprise-grade 90%+ quality with complete validation.`
    });

    // Strategia di completamento (finalizzazione)
    this.strategies.push({
      name: 'completion',
      priority: 10,
      focusAreas: ['finalization', 'verification', 'handoff'],
      trigger: (context) => context.currentQuality >= 85,
      generatePrompt: (context) => `## COMPLETION PHASE

**COMPLETION OBJECTIVE**: Finalize "${context.userObjective}" to enterprise standards

**NEAR-FINAL STATUS**:
- Quality achieved: ${context.currentQuality}%
- Elements count: ${context.elementsCount}
- Completion threshold: 90%+ (Enterprise Grade)

**COMPLETION STRATEGY**:
1. **Final Validation**: Comprehensive enterprise-grade verification
2. **Documentation**: Complete engineering package
3. **Quality Assurance**: Final compliance check
4. **Handoff Preparation**: Ready for production

**FINAL ACTIONS**:
- Complete final dimensional verification
- Validate all material and manufacturing specifications
- Generate complete engineering documentation
- Perform final quality assurance checks
- Prepare production-ready package

**ENTERPRISE DELIVERY**: This iteration should complete the objective to production-ready standards.`
    });

    // Strategia di recupero errori
    this.strategies.push({
      name: 'error_recovery',
      priority: 6,
      focusAreas: ['debugging', 'correction', 'stabilization'],
      trigger: (context) => context.currentQuality < 50 || context.lastActions.some(action => action.includes('error')),
      generatePrompt: (context) => `## ERROR RECOVERY PHASE

**RECOVERY OBJECTIVE**: Stabilize and correct "${context.userObjective}"

**ERROR ANALYSIS**:
- Current quality: ${context.currentQuality}% (Below threshold)
- Elements count: ${context.elementsCount}
- Last actions: ${context.lastActions.join(', ')}

**RECOVERY STRATEGY**:
1. **Root Cause Analysis**: Identify core issues
2. **Systematic Correction**: Fix fundamental problems first
3. **Quality Stabilization**: Establish reliable baseline
4. **Progressive Improvement**: Build upon stable foundation

**CORRECTIVE ACTIONS**:
- Identify and fix critical design errors
- Verify basic dimensional consistency
- Correct material specifications
- Establish proper tolerance chains
- Validate fundamental geometry

**RECOVERY TARGET**: Achieve stable 60%+ quality foundation.`
    });

    // Strategia di fallback
    this.strategies.push({
      name: 'fallback',
      priority: 1,
      focusAreas: ['general', 'adaptive'],
      trigger: () => true, // Always applicable as fallback
      generatePrompt: (context) => `## ADAPTIVE EXECUTION

**OBJECTIVE**: Progress towards "${context.userObjective}" with adaptive strategy

**CURRENT STATE**:
- Iteration: ${context.currentIteration}
- Quality: ${context.currentQuality}%
- Elements: ${context.elementsCount}

**ADAPTIVE STRATEGY**:
Based on current progress, determine and execute the most valuable actions to advance towards the objective while maintaining enterprise quality standards.

**EXECUTION FOCUS**:
- Analyze current gaps and opportunities
- Execute high-impact improvements
- Maintain engineering standards
- Progress systematically towards completion

**ENTERPRISE REQUIREMENTS**: All outputs must meet professional CAD standards with complete engineering specifications.`
    });
  }

  /**
   * Ottiene expertise del dominio
   */
  private getDomainExpertise(domain: string): string {
    const domainMap: Record<string, string> = {
      mechanical: 'mechanical design and precision engineering',
      electronic: 'electronics design and PCB engineering',
      architectural: 'architectural design and structural engineering',
      industrial: 'industrial design and manufacturing engineering',
      automotive: 'automotive engineering and vehicle design',
      aerospace: 'aerospace engineering and aviation systems'
    };
    return domainMap[domain] || 'mechanical design and engineering';
  }

  /**
   * Ottiene soglia di qualità per complessità
   */
  private getQualityThreshold(complexity: string): number {
    const thresholds: Record<string, number> = {
      simple: 85,
      moderate: 88,
      complex: 90,
      enterprise: 92
    };
    return thresholds[complexity] || 85;
  }

  /**
   * Ottiene indicatore di progresso
   */
  private getProgressIndicator(quality: number): string {
    if (quality < 30) return '🔴 CRITICAL - Foundation Issues';
    if (quality < 50) return '🟡 DEVELOPING - Basic Structure';
    if (quality < 70) return '🟠 PROGRESSING - Core Complete';
    if (quality < 85) return '🔵 ADVANCING - Near Target';
    if (quality < 95) return '🟢 EXCELLENT - Enterprise Ready';
    return '🏆 OUTSTANDING - Industry Leading';
  }

  /**
   * Ottiene statistiche del sistema di prompt
   */
  getPromptStats(): {
    totalPrompts: number;
    strategiesUsed: Record<string, number>;
    averagePromptLength: number;
    mostUsedStrategy: string;
  } {
    const strategiesUsed: Record<string, number> = {};
    let totalLength = 0;

    for (const entry of this.promptHistory) {
      strategiesUsed[entry.strategy] = (strategiesUsed[entry.strategy] || 0) + 1;
      totalLength += entry.prompt.length;
    }

    const mostUsedStrategy = Object.entries(strategiesUsed)
      .sort(([,a], [,b]) => b - a)[0]?.[0] || 'none';

    return {
      totalPrompts: this.promptHistory.length,
      strategiesUsed,
      averagePromptLength: this.promptHistory.length > 0 ? Math.round(totalLength / this.promptHistory.length) : 0,
      mostUsedStrategy
    };
  }
}

// Esporta istanza singleton
export const continuousPromptSystem = new ContinuousPromptSystem();
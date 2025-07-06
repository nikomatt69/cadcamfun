// Design Optimization Templates
// src/lib/ai/codeInterpreter/templates/optimization.ts

import { CADTemplate } from "./index";

export const optimizationTemplates: CADTemplate[] = [
  {
    id: "design_optimization",
    name: "Design Optimization Analysis",
    description: "Optimize design parameters for performance and efficiency",
    category: "optimization",
    difficulty: "advanced",
    estimatedTime: "4-5 minutes",
    requiredPackages: ["matplotlib", "numpy", "scipy"],
    outputTypes: ["optimization_report", "performance_metrics", "recommendations"],
    code: `import matplotlib.pyplot as plt
import numpy as np
from scipy.optimize import minimize

elements = cadElements if 'cadElements' in globals() else []

def multi_objective_score(element):
    """Calculate multi-objective optimization score"""
    # Volume efficiency (smaller is better)
    volume = element.get('width', 10) * element.get('height', 10) * element.get('depth', 10) if element.get('type') == 'cube' else np.pi * element.get('radius', 5)**2 * element.get('height', 10)
    
    # Material cost factor
    material_costs = {'steel': 5, 'aluminum': 8, 'plastic': 2.5, 'titanium': 25}
    material = element.get('material', 'steel').lower()
    cost_factor = material_costs.get(material, 5)
    
    # Performance score (higher is better, so we'll minimize negative)
    performance = volume / cost_factor
    
    return {
        'volume': volume,
        'cost_factor': cost_factor,
        'performance_score': performance,
        'efficiency_rating': min(100, max(0, 100 - (volume / 1000) * cost_factor))
    }

optimization_results = []
for i, element in enumerate(elements):
    result = multi_objective_score(element)
    result['element_id'] = i
    result['element_type'] = element.get('type', 'unknown')
    optimization_results.append(result)

print("⚡ DESIGN OPTIMIZATION ANALYSIS")
print("=" * 50)

if optimization_results:
    # Create visualization
    fig, ((ax1, ax2), (ax3, ax4)) = plt.subplots(2, 2, figsize=(16, 12))
    
    element_names = [f"{r['element_type']} {r['element_id']+1}" for r in optimization_results]
    
    # Performance scores
    scores = [r['performance_score'] for r in optimization_results]
    ax1.bar(range(len(scores)), scores, color='skyblue', alpha=0.7)
    ax1.set_title('Performance Scores')
    ax1.set_xlabel('Element')
    ax1.set_ylabel('Score')
    ax1.set_xticks(range(len(element_names)))
    ax1.set_xticklabels(element_names, rotation=45, ha='right')
    
    # Efficiency ratings
    ratings = [r['efficiency_rating'] for r in optimization_results]
    colors = ['green' if r >= 70 else 'orange' if r >= 50 else 'red' for r in ratings]
    ax2.bar(range(len(ratings)), ratings, color=colors, alpha=0.7)
    ax2.set_title('Efficiency Ratings')
    ax2.set_xlabel('Element')
    ax2.set_ylabel('Rating (%)')
    ax2.set_xticks(range(len(element_names)))
    ax2.set_xticklabels(element_names, rotation=45, ha='right')
    
    plt.tight_layout()
    plt.savefig('optimization_analysis.png', dpi=150, bbox_inches='tight')
    plt.show()

    print("🎯 OPTIMIZATION RECOMMENDATIONS:")
    best_performer = max(optimization_results, key=lambda x: x['performance_score'])
    print(f"Best performing element: {best_performer['element_type']} {best_performer['element_id']+1}")
    print(f"Performance score: {best_performer['performance_score']:.2f}")
else:
    print("⚠️ No elements found for optimization analysis")
`
  }
];

// Quality Control Templates
// src/lib/ai/codeInterpreter/templates/quality.ts

import { CADTemplate } from "./index";

export const qualityTemplates: CADTemplate[] = [
  {
    id: "tolerance_analysis",
    name: "Tolerance Analysis",
    description: "Analyze dimensional tolerances and quality metrics",
    category: "quality",
    difficulty: "intermediate",
    estimatedTime: "3-4 minutes",
    requiredPackages: ["matplotlib", "numpy"],
    outputTypes: ["tolerance_report", "quality_metrics"],
    code: `import matplotlib.pyplot as plt
import numpy as np

elements = cadElements if 'cadElements' in globals() else []

def analyze_tolerances(element):
    """Analyze dimensional tolerances"""
    el_type = element.get('type', 'unknown')
    
    # Standard tolerance grades (IT7 for normal precision)
    tolerance_grade = 0.01  # ±0.01mm
    
    if el_type == 'cube':
        dimensions = [element.get('width', 10), element.get('height', 10), element.get('depth', 10)]
    elif el_type == 'cylinder':
        dimensions = [element.get('radius', 5) * 2, element.get('height', 10)]  # diameter, height
    elif el_type == 'sphere':
        dimensions = [element.get('radius', 5) * 2]  # diameter
    else:
        dimensions = [10]  # default
    
    # Calculate tolerance stack-up
    total_tolerance = len(dimensions) * tolerance_grade
    
    # Quality metrics
    precision_rating = max(0, 100 - (total_tolerance / max(dimensions) * 100))
    
    return {
        'dimensions': dimensions,
        'tolerance_grade': tolerance_grade,
        'total_tolerance': total_tolerance,
        'precision_rating': precision_rating
    }

print("✅ QUALITY CONTROL ANALYSIS")
print("=" * 50)

tolerance_results = []
for i, element in enumerate(elements):
    result = analyze_tolerances(element)
    result['element_id'] = i
    result['element_type'] = element.get('type', 'unknown')
    tolerance_results.append(result)

if tolerance_results:
    # Visualization
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 6))
    
    element_names = [f"{r['element_type']} {r['element_id']+1}" for r in tolerance_results]
    
    # Precision ratings
    ratings = [r['precision_rating'] for r in tolerance_results]
    colors = ['green' if r >= 90 else 'orange' if r >= 80 else 'red' for r in ratings]
    ax1.bar(range(len(ratings)), ratings, color=colors, alpha=0.7)
    ax1.set_title('Precision Ratings')
    ax1.set_xlabel('Element')
    ax1.set_ylabel('Rating (%)')
    ax1.set_xticks(range(len(element_names)))
    ax1.set_xticklabels(element_names, rotation=45, ha='right')
    
    # Tolerance values
    tolerances = [r['total_tolerance'] for r in tolerance_results]
    ax2.bar(range(len(tolerances)), tolerances, color='lightblue', alpha=0.7)
    ax2.set_title('Total Tolerances')
    ax2.set_xlabel('Element')
    ax2.set_ylabel('Tolerance (mm)')
    ax2.set_xticks(range(len(element_names)))
    ax2.set_xticklabels(element_names, rotation=45, ha='right')
    
    plt.tight_layout()
    plt.savefig('quality_analysis.png', dpi=150, bbox_inches='tight')
    plt.show()
    
    avg_precision = np.mean(ratings)
    print(f"Average precision rating: {avg_precision:.1f}%")
    
    high_precision = sum(1 for r in ratings if r >= 90)
    print(f"High precision elements: {high_precision}/{len(tolerance_results)}")
else:
    print("⚠️ No elements found for quality analysis")
`
  }
];

// Structural Analysis Templates
// src/lib/ai/codeInterpreter/templates/structural.ts

import { CADTemplate } from "./index";

export const structuralTemplates: CADTemplate[] = [
  {
    id: "stress_analysis_basic",
    name: "Basic Stress Analysis",
    description: "Estimate stress concentrations and basic structural integrity",
    category: "structural",
    difficulty: "intermediate",
    estimatedTime: "3-4 minutes",
    requiredPackages: ["matplotlib", "numpy"],
    outputTypes: ["stress_report", "safety_factors", "recommendations"],
    code: `import matplotlib.pyplot as plt
import numpy as np

elements = cadElements if 'cadElements' in globals() else []

# Material properties for stress analysis
MATERIAL_PROPERTIES = {
    'steel': {'yield_strength': 250, 'ultimate_strength': 400, 'elastic_modulus': 200},
    'aluminum': {'yield_strength': 110, 'ultimate_strength': 200, 'elastic_modulus': 70},
    'titanium': {'yield_strength': 880, 'ultimate_strength': 950, 'elastic_modulus': 110},
    'plastic': {'yield_strength': 30, 'ultimate_strength': 45, 'elastic_modulus': 2.5}
}

def calculate_basic_stress(element, applied_force=1000):  # Default 1000N force
    """Calculate basic stress for simple geometries"""
    el_type = element.get('type', 'unknown')
    material = element.get('material', 'steel').lower()
    
    if el_type == 'cube':
        width = element.get('width', 10)
        height = element.get('height', 10)
        area = width * height  # Cross-sectional area
        stress = applied_force / area
        
    elif el_type == 'cylinder':
        radius = element.get('radius', 5)
        area = np.pi * radius**2
        stress = applied_force / area
        
    elif el_type == 'sphere':
        radius = element.get('radius', 5)
        area = np.pi * radius**2  # Cross-sectional area
        stress = applied_force / area
        
    else:
        stress = 0
    
    # Calculate safety factors
    material_props = MATERIAL_PROPERTIES.get(material, MATERIAL_PROPERTIES['steel'])
    yield_safety_factor = material_props['yield_strength'] / max(stress, 0.001)
    ultimate_safety_factor = material_props['ultimate_strength'] / max(stress, 0.001)
    
    return {
        'stress_mpa': stress,
        'yield_safety_factor': yield_safety_factor,
        'ultimate_safety_factor': ultimate_safety_factor,
        'material_yield': material_props['yield_strength'],
        'material_ultimate': material_props['ultimate_strength']
    }

# Analyze all elements
stress_results = []
for i, element in enumerate(elements):
    result = calculate_basic_stress(element)
    result['element_id'] = i
    result['element_type'] = element.get('type', 'unknown')
    result['material'] = element.get('material', 'steel')
    stress_results.append(result)

print("🏗️ STRUCTURAL STRESS ANALYSIS")
print("=" * 50)
print(f"Analyzed elements: {len(elements)}")
print(f"Applied load: 1000 N (adjustable)")
print()

# Safety assessment
safe_elements = sum(1 for r in stress_results if r['yield_safety_factor'] >= 2.0)
marginal_elements = sum(1 for r in stress_results if 1.5 <= r['yield_safety_factor'] < 2.0)
unsafe_elements = sum(1 for r in stress_results if r['yield_safety_factor'] < 1.5)

print("🛡️ SAFETY ASSESSMENT:")
print(f"Safe elements (SF ≥ 2.0): {safe_elements}")
print(f"Marginal elements (1.5 ≤ SF < 2.0): {marginal_elements}")
print(f"Unsafe elements (SF < 1.5): {unsafe_elements}")

# Create visualization
if stress_results:
    fig, ((ax1, ax2), (ax3, ax4)) = plt.subplots(2, 2, figsize=(16, 12))
    
    # 1. Stress levels
    element_names = [f"{r['element_type']} {r['element_id']+1}" for r in stress_results]
    stresses = [r['stress_mpa'] for r in stress_results]
    
    colors = ['green' if r['yield_safety_factor'] >= 2.0 
             else 'orange' if r['yield_safety_factor'] >= 1.5 
             else 'red' for r in stress_results]
    
    bars = ax1.bar(range(len(stresses)), stresses, color=colors, alpha=0.7, edgecolor='black')
    ax1.set_xlabel('Element')
    ax1.set_ylabel('Stress (MPa)')
    ax1.set_title('Stress Analysis Results')
    ax1.set_xticks(range(len(element_names)))
    ax1.set_xticklabels(element_names, rotation=45, ha='right')
    ax1.grid(True, alpha=0.3)
    
    # 2. Safety factors
    safety_factors = [r['yield_safety_factor'] for r in stress_results]
    ax2.bar(range(len(safety_factors)), safety_factors, color=colors, alpha=0.7, edgecolor='black')
    ax2.axhline(y=2.0, color='green', linestyle='--', label='Safe threshold')
    ax2.axhline(y=1.5, color='orange', linestyle='--', label='Marginal threshold')
    ax2.set_xlabel('Element')
    ax2.set_ylabel('Safety Factor')
    ax2.set_title('Yield Safety Factors')
    ax2.set_xticks(range(len(element_names)))
    ax2.set_xticklabels(element_names, rotation=45, ha='right')
    ax2.legend()
    ax2.grid(True, alpha=0.3)
    
    plt.tight_layout()
    plt.savefig('stress_analysis.png', dpi=150, bbox_inches='tight')
    plt.show()

print("\\n📋 DETAILED RESULTS:")
for r in stress_results:
    status = "✅ SAFE" if r['yield_safety_factor'] >= 2.0 else "⚠️ MARGINAL" if r['yield_safety_factor'] >= 1.5 else "❌ UNSAFE"
    print(f"Element {r['element_id']+1} ({r['element_type']}, {r['material']}): {status}")
    print(f"  Stress: {r['stress_mpa']:.1f} MPa")
    print(f"  Safety Factor: {r['yield_safety_factor']:.2f}")
`
  }
];

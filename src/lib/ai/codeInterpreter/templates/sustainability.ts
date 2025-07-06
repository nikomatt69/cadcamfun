// Sustainability Templates
// src/lib/ai/codeInterpreter/templates/sustainability.ts

import { CADTemplate } from "./index";

export const sustainabilityTemplates: CADTemplate[] = [
  {
    id: "environmental_impact",
    name: "Environmental Impact Analysis",
    description: "Assess carbon footprint and environmental sustainability",
    category: "sustainability",
    difficulty: "intermediate",
    estimatedTime: "3-4 minutes",
    requiredPackages: ["matplotlib", "numpy"],
    outputTypes: ["sustainability_report", "carbon_footprint"],
    code: `import matplotlib.pyplot as plt
import numpy as np

elements = cadElements if 'cadElements' in globals() else []

# Carbon footprint data (kg CO2 per kg material)
CARBON_FOOTPRINT = {
    'steel': 2.3,      # kg CO2/kg
    'aluminum': 8.2,   # kg CO2/kg (high due to smelting)
    'plastic': 3.4,    # kg CO2/kg
    'titanium': 14.0,  # kg CO2/kg
    'copper': 3.9      # kg CO2/kg
}

MATERIAL_DENSITIES = {
    'steel': 7.85, 'aluminum': 2.70, 'plastic': 1.20, 'titanium': 4.43, 'copper': 8.96
}

def calculate_environmental_impact(element):
    """Calculate environmental impact metrics"""
    material = element.get('material', 'steel').lower()
    
    # Calculate volume
    el_type = element.get('type', 'unknown')
    if el_type == 'cube':
        volume_mm3 = element.get('width', 10) * element.get('height', 10) * element.get('depth', 10)
    elif el_type == 'sphere':
        radius = element.get('radius', 5)
        volume_mm3 = (4/3) * np.pi * radius**3
    elif el_type == 'cylinder':
        radius = element.get('radius', 5)
        height = element.get('height', 10)
        volume_mm3 = np.pi * radius**2 * height
    else:
        volume_mm3 = 1000  # default
    
    volume_cm3 = volume_mm3 / 1000
    density = MATERIAL_DENSITIES.get(material, 7.85)
    mass_kg = volume_cm3 * density / 1000
    
    # Carbon footprint
    carbon_per_kg = CARBON_FOOTPRINT.get(material, 2.3)
    total_carbon = mass_kg * carbon_per_kg
    
    # Sustainability score (lower carbon = higher score)
    sustainability_score = max(0, 100 - (total_carbon * 10))
    
    return {
        'material': material,
        'mass_kg': mass_kg,
        'carbon_footprint': total_carbon,
        'sustainability_score': sustainability_score
    }

print("🌱 ENVIRONMENTAL SUSTAINABILITY ANALYSIS")
print("=" * 50)

env_results = []
for i, element in enumerate(elements):
    result = calculate_environmental_impact(element)
    result['element_id'] = i
    result['element_type'] = element.get('type', 'unknown')
    env_results.append(result)

if env_results:
    total_carbon = sum(r['carbon_footprint'] for r in env_results)
    avg_sustainability = np.mean([r['sustainability_score'] for r in env_results])
    
    print(f"Total carbon footprint: {total_carbon:.2f} kg CO2")
    print(f"Average sustainability score: {avg_sustainability:.1f}/100")
    
    # Visualization
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 6))
    
    element_names = [f"{r['element_type']} {r['element_id']+1}" for r in env_results]
    
    # Carbon footprint
    carbon_values = [r['carbon_footprint'] for r in env_results]
    ax1.bar(range(len(carbon_values)), carbon_values, color='red', alpha=0.7)
    ax1.set_title('Carbon Footprint by Element')
    ax1.set_xlabel('Element')
    ax1.set_ylabel('CO2 (kg)')
    ax1.set_xticks(range(len(element_names)))
    ax1.set_xticklabels(element_names, rotation=45, ha='right')
    
    # Sustainability scores
    scores = [r['sustainability_score'] for r in env_results]
    colors = ['green' if s >= 70 else 'orange' if s >= 50 else 'red' for s in scores]
    ax2.bar(range(len(scores)), scores, color=colors, alpha=0.7)
    ax2.set_title('Sustainability Scores')
    ax2.set_xlabel('Element')
    ax2.set_ylabel('Score')
    ax2.set_xticks(range(len(element_names)))
    ax2.set_xticklabels(element_names, rotation=45, ha='right')
    
    plt.tight_layout()
    plt.savefig('sustainability_analysis.png', dpi=150, bbox_inches='tight')
    plt.show()
    
    # Recommendations
    print("\\n🎯 SUSTAINABILITY RECOMMENDATIONS:")
    high_carbon_elements = [r for r in env_results if r['carbon_footprint'] > np.mean(carbon_values)]
    if high_carbon_elements:
        print("Consider material alternatives for high-carbon elements:")
        for elem in high_carbon_elements[:3]:
            print(f"  Element {elem['element_id']+1}: {elem['carbon_footprint']:.2f} kg CO2")
else:
    print("⚠️ No elements found for sustainability analysis")
`
  }
];

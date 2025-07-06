// Geometric Analysis Templates
// src/lib/ai/codeInterpreter/templates/geometric.ts

import { CADTemplate } from "./index";

export const geometricTemplates: CADTemplate[] = [
  {
    id: "basic_volume_analysis",
    name: "Basic Volume Analysis",
    description: "Calculate total volume and volume distribution of CAD elements",
    category: "geometric",
    difficulty: "basic",
    estimatedTime: "1-2 minutes",
    requiredPackages: ["matplotlib", "numpy"],
    outputTypes: ["chart", "statistics"],
    code: `import matplotlib.pyplot as plt
import numpy as np
from collections import Counter

# Get CAD elements from context
elements = cadElements if 'cadElements' in globals() else []

def calculate_volume(element):
    """Calculate volume based on element type"""
    el_type = element.get('type', 'unknown')
    if el_type == 'cube':
        return element.get('width', 0) * element.get('height', 0) * element.get('depth', 0)
    elif el_type == 'sphere':
        radius = element.get('radius', 0)
        return (4/3) * np.pi * radius**3
    elif el_type == 'cylinder':
        radius = element.get('radius', 0)
        height = element.get('height', 0)
        return np.pi * radius**2 * height
    elif el_type == 'cone':
        radius = element.get('radius', 0)
        height = element.get('height', 0)
        return (1/3) * np.pi * radius**2 * height
    return 0

# Calculate volumes
volumes = [calculate_volume(el) for el in elements]
total_volume = sum(volumes)
element_types = Counter([el.get('type', 'unknown') for el in elements])

# Statistics
print("📐 GEOMETRIC ANALYSIS RESULTS")
print("=" * 40)
print(f"Total elements: {len(elements)}")
print(f"Total volume: {total_volume:.2f} cubic units")
print(f"Average volume: {np.mean(volumes):.2f} cubic units" if volumes else "No elements")
print(f"Max volume: {max(volumes):.2f} cubic units" if volumes else "No elements")
print(f"Min volume: {min(volumes):.2f} cubic units" if volumes else "No elements")

# Create visualization
if elements:
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 6))
    
    # Volume distribution pie chart
    ax1.pie(element_types.values(), labels=element_types.keys(), autopct='%1.1f%%', startangle=90)
    ax1.set_title('Element Type Distribution')
    
    # Volume histogram
    if len(volumes) > 1:
        ax2.hist(volumes, bins=min(10, len(volumes)), edgecolor='black', alpha=0.7)
        ax2.set_xlabel('Volume (cubic units)')
        ax2.set_ylabel('Frequency')
        ax2.set_title('Volume Distribution')
        ax2.grid(True, alpha=0.3)
    else:
        ax2.bar(['Total'], [total_volume], color='skyblue', edgecolor='black')
        ax2.set_ylabel('Volume (cubic units)')
        ax2.set_title('Total Volume')
    
    plt.tight_layout()
    plt.savefig('volume_analysis.png', dpi=150, bbox_inches='tight')
    plt.show()
else:
    print("⚠️ No CAD elements found for analysis")
`
  },
  {
    id: "surface_area_analysis",
    name: "Surface Area Analysis",
    description: "Calculate surface areas and surface-to-volume ratios",
    category: "geometric",
    difficulty: "basic",
    estimatedTime: "2-3 minutes",
    requiredPackages: ["matplotlib", "numpy"],
    outputTypes: ["chart", "statistics"],
    code: `import matplotlib.pyplot as plt
import numpy as np

elements = cadElements if 'cadElements' in globals() else []

def calculate_surface_area(element):
    """Calculate surface area based on element type"""
    el_type = element.get('type', 'unknown')
    if el_type == 'cube':
        w, h, d = element.get('width', 0), element.get('height', 0), element.get('depth', 0)
        return 2 * (w*h + w*d + h*d)
    elif el_type == 'sphere':
        radius = element.get('radius', 0)
        return 4 * np.pi * radius**2
    elif el_type == 'cylinder':
        radius = element.get('radius', 0)
        height = element.get('height', 0)
        return 2 * np.pi * radius * (radius + height)
    elif el_type == 'cone':
        radius = element.get('radius', 0)
        height = element.get('height', 0)
        slant_height = np.sqrt(radius**2 + height**2)
        return np.pi * radius * (radius + slant_height)
    return 0

def calculate_volume(element):
    """Calculate volume for surface-to-volume ratio"""
    el_type = element.get('type', 'unknown')
    if el_type == 'cube':
        return element.get('width', 0) * element.get('height', 0) * element.get('depth', 0)
    elif el_type == 'sphere':
        radius = element.get('radius', 0)
        return (4/3) * np.pi * radius**3
    elif el_type == 'cylinder':
        radius = element.get('radius', 0)
        height = element.get('height', 0)
        return np.pi * radius**2 * height
    elif el_type == 'cone':
        radius = element.get('radius', 0)
        height = element.get('height', 0)
        return (1/3) * np.pi * radius**2 * height
    return 0

# Calculate surface areas and volumes
surface_areas = [calculate_surface_area(el) for el in elements]
volumes = [calculate_volume(el) for el in elements]
sv_ratios = [sa/vol if vol > 0 else 0 for sa, vol in zip(surface_areas, volumes)]

total_surface_area = sum(surface_areas)
total_volume = sum(volumes)

print("🔲 SURFACE AREA ANALYSIS")
print("=" * 40)
print(f"Total surface area: {total_surface_area:.2f} square units")
print(f"Average surface area: {np.mean(surface_areas):.2f} square units" if surface_areas else "No elements")
print(f"Total surface-to-volume ratio: {total_surface_area/total_volume:.3f}" if total_volume > 0 else "No volume")

if elements:
    fig, ((ax1, ax2), (ax3, ax4)) = plt.subplots(2, 2, figsize=(14, 10))
    
    # Surface area by element
    element_names = [f"{el.get('type', 'unknown')} {i+1}" for i, el in enumerate(elements)]
    ax1.bar(range(len(surface_areas)), surface_areas, color='lightcoral', edgecolor='black')
    ax1.set_xlabel('Element')
    ax1.set_ylabel('Surface Area')
    ax1.set_title('Surface Area by Element')
    ax1.set_xticks(range(len(element_names)))
    ax1.set_xticklabels(element_names, rotation=45, ha='right')
    
    # Volume vs Surface Area scatter
    ax2.scatter(volumes, surface_areas, c='skyblue', s=100, edgecolor='black', alpha=0.7)
    ax2.set_xlabel('Volume')
    ax2.set_ylabel('Surface Area')
    ax2.set_title('Volume vs Surface Area')
    ax2.grid(True, alpha=0.3)
    
    # Surface-to-Volume ratio
    ax3.bar(range(len(sv_ratios)), sv_ratios, color='lightgreen', edgecolor='black')
    ax3.set_xlabel('Element')
    ax3.set_ylabel('Surface/Volume Ratio')
    ax3.set_title('Surface-to-Volume Ratios')
    ax3.set_xticks(range(len(element_names)))
    ax3.set_xticklabels(element_names, rotation=45, ha='right')
    
    # Efficiency comparison (lower S/V ratio = more efficient)
    avg_sv_ratio = np.mean(sv_ratios) if sv_ratios else 0
    efficiency_colors = ['green' if ratio < avg_sv_ratio else 'orange' if ratio < avg_sv_ratio * 1.5 else 'red' for ratio in sv_ratios]
    ax4.bar(range(len(sv_ratios)), sv_ratios, color=efficiency_colors, edgecolor='black')
    ax4.axhline(y=avg_sv_ratio, color='blue', linestyle='--', label=f'Average: {avg_sv_ratio:.3f}')
    ax4.set_xlabel('Element')
    ax4.set_ylabel('S/V Ratio')
    ax4.set_title('Efficiency Analysis (Green=Efficient)')
    ax4.legend()
    ax4.set_xticks(range(len(element_names)))
    ax4.set_xticklabels(element_names, rotation=45, ha='right')
    
    plt.tight_layout()
    plt.savefig('surface_analysis.png', dpi=150, bbox_inches='tight')
    plt.show()
else:
    print("⚠️ No CAD elements found for analysis")
`
  },
  {
    id: "dimensional_analysis",
    name: "Dimensional Analysis",
    description: "Analyze dimensions, aspect ratios, and size distributions",
    category: "geometric",
    difficulty: "intermediate",
    estimatedTime: "3-4 minutes",
    requiredPackages: ["matplotlib", "numpy", "pandas"],
    outputTypes: ["chart", "statistics", "report"],
    code: `import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

elements = cadElements if 'cadElements' in globals() else []

def extract_dimensions(element):
    """Extract all dimensional information from element"""
    el_type = element.get('type', 'unknown')
    dimensions = {}
    
    if el_type == 'cube':
        dimensions = {
            'width': element.get('width', 0),
            'height': element.get('height', 0),
            'depth': element.get('depth', 0),
            'max_dim': max(element.get('width', 0), element.get('height', 0), element.get('depth', 0)),
            'min_dim': min(element.get('width', 0), element.get('height', 0), element.get('depth', 0)),
            'aspect_ratio': max(element.get('width', 0), element.get('height', 0), element.get('depth', 0)) / max(min(element.get('width', 0), element.get('height', 0), element.get('depth', 0)), 0.001)
        }
    elif el_type in ['sphere', 'cylinder', 'cone']:
        radius = element.get('radius', 0)
        height = element.get('height', 0) if el_type != 'sphere' else radius * 2
        dimensions = {
            'radius': radius,
            'diameter': radius * 2,
            'height': height,
            'max_dim': max(radius * 2, height),
            'min_dim': min(radius * 2, height),
            'aspect_ratio': max(radius * 2, height) / max(min(radius * 2, height), 0.001)
        }
    
    dimensions['type'] = el_type
    return dimensions

# Extract all dimensions
dim_data = [extract_dimensions(el) for el in elements]
if not dim_data:
    print("⚠️ No CAD elements found for analysis")
else:
    df = pd.DataFrame(dim_data)
    
    print("📏 DIMENSIONAL ANALYSIS")
    print("=" * 40)
    print(f"Total elements analyzed: {len(elements)}")
    print()
    
    # Statistics by type
    type_stats = df.groupby('type').agg({
        'max_dim': ['count', 'mean', 'std', 'min', 'max'],
        'aspect_ratio': ['mean', 'std']
    }).round(3)
    
    print("📊 Statistics by Element Type:")
    print(type_stats)
    print()
    
    # Overall statistics
    print("📈 Overall Dimensional Statistics:")
    print(f"Average max dimension: {df['max_dim'].mean():.3f}")
    print(f"Average min dimension: {df['min_dim'].mean():.3f}")
    print(f"Average aspect ratio: {df['aspect_ratio'].mean():.3f}")
    print(f"Dimension range: {df['max_dim'].min():.3f} - {df['max_dim'].max():.3f}")
    
    # Create comprehensive visualization
    fig = plt.figure(figsize=(16, 12))
    
    # 1. Dimension distribution by type
    ax1 = plt.subplot(2, 3, 1)
    types = df['type'].unique()
    for i, el_type in enumerate(types):
        type_data = df[df['type'] == el_type]
        ax1.scatter(type_data['max_dim'], type_data['min_dim'], 
                   label=el_type, s=100, alpha=0.7)
    ax1.set_xlabel('Max Dimension')
    ax1.set_ylabel('Min Dimension')
    ax1.set_title('Dimension Scatter Plot')
    ax1.legend()
    ax1.grid(True, alpha=0.3)
    
    # 2. Aspect ratio analysis
    ax2 = plt.subplot(2, 3, 2)
    ax2.hist(df['aspect_ratio'], bins=10, edgecolor='black', alpha=0.7, color='skyblue')
    ax2.axvline(df['aspect_ratio'].mean(), color='red', linestyle='--', 
                label=f'Mean: {df["aspect_ratio"].mean():.2f}')
    ax2.set_xlabel('Aspect Ratio')
    ax2.set_ylabel('Frequency')
    ax2.set_title('Aspect Ratio Distribution')
    ax2.legend()
    ax2.grid(True, alpha=0.3)
    
    # 3. Size comparison
    ax3 = plt.subplot(2, 3, 3)
    element_names = [f"{row['type']} {i+1}" for i, row in df.iterrows()]
    x_pos = np.arange(len(element_names))
    ax3.bar(x_pos - 0.2, df['max_dim'], 0.4, label='Max Dim', color='orange', alpha=0.7)
    ax3.bar(x_pos + 0.2, df['min_dim'], 0.4, label='Min Dim', color='blue', alpha=0.7)
    ax3.set_xlabel('Element')
    ax3.set_ylabel('Dimension')
    ax3.set_title('Dimension Comparison')
    ax3.set_xticks(x_pos)
    ax3.set_xticklabels(element_names, rotation=45, ha='right')
    ax3.legend()
    ax3.grid(True, alpha=0.3)
    
    # 4. Type distribution
    ax4 = plt.subplot(2, 3, 4)
    type_counts = df['type'].value_counts()
    ax4.pie(type_counts.values, labels=type_counts.index, autopct='%1.1f%%', startangle=90)
    ax4.set_title('Element Type Distribution')
    
    # 5. Aspect ratio by type
    ax5 = plt.subplot(2, 3, 5)
    for el_type in types:
        type_data = df[df['type'] == el_type]
        ax5.scatter([el_type] * len(type_data), type_data['aspect_ratio'], 
                   s=100, alpha=0.7)
    ax5.set_ylabel('Aspect Ratio')
    ax5.set_title('Aspect Ratio by Type')
    ax5.tick_params(axis='x', rotation=45)
    ax5.grid(True, alpha=0.3)
    
    # 6. Size efficiency (volume per unit max dimension)
    ax6 = plt.subplot(2, 3, 6)
    # Estimate volume efficiency
    df['size_efficiency'] = df['min_dim'] / df['max_dim']  # Simple efficiency metric
    efficiency_colors = ['green' if eff > df['size_efficiency'].mean() else 'orange' for eff in df['size_efficiency']]
    ax6.bar(range(len(df)), df['size_efficiency'], color=efficiency_colors, alpha=0.7, edgecolor='black')
    ax6.axhline(y=df['size_efficiency'].mean(), color='red', linestyle='--', 
                label=f'Mean: {df["size_efficiency"].mean():.3f}')
    ax6.set_xlabel('Element')
    ax6.set_ylabel('Size Efficiency')
    ax6.set_title('Size Efficiency (Green=Efficient)')
    ax6.set_xticks(range(len(element_names)))
    ax6.set_xticklabels(element_names, rotation=45, ha='right')
    ax6.legend()
    ax6.grid(True, alpha=0.3)
    
    plt.tight_layout()
    plt.savefig('dimensional_analysis.png', dpi=150, bbox_inches='tight')
    plt.show()
    
    # Generate detailed report
    print("\\n" + "="*50)
    print("📋 DETAILED DIMENSIONAL REPORT")
    print("="*50)
    for i, row in df.iterrows():
        print(f"\\nElement {i+1} ({row['type'].upper()}):")
        print(f"  Max dimension: {row['max_dim']:.3f}")
        print(f"  Min dimension: {row['min_dim']:.3f}")
        print(f"  Aspect ratio: {row['aspect_ratio']:.3f}")
        print(f"  Size efficiency: {row['size_efficiency']:.3f}")
`
  }
];

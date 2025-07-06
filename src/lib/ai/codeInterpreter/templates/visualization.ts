// Advanced Visualization Templates
// src/lib/ai/codeInterpreter/templates/visualization.ts

import { CADTemplate } from "./index";

export const visualizationTemplates: CADTemplate[] = [
  {
    id: "advanced_3d_visualization",
    name: "Advanced 3D Visualization",
    description: "Create interactive 3D plots and advanced visualizations",
    category: "visualization",
    difficulty: "intermediate",
    estimatedTime: "3-4 minutes",
    requiredPackages: ["matplotlib", "numpy", "plotly"],
    outputTypes: ["3d_plots", "interactive_charts", "dashboards"],
    code: `import matplotlib.pyplot as plt
import numpy as np
from mpl_toolkits.mplot3d import Axes3D

elements = cadElements if 'cadElements' in globals() else []

print("📊 ADVANCED 3D VISUALIZATION")
print("=" * 50)

if elements:
    # Create comprehensive 3D visualization
    fig = plt.figure(figsize=(20, 15))
    
    # 1. 3D Scatter plot of elements
    ax1 = fig.add_subplot(2, 3, 1, projection='3d')
    
    positions_x = []
    positions_y = []
    positions_z = []
    sizes = []
    colors = []
    
    color_map = {'cube': 'blue', 'sphere': 'red', 'cylinder': 'green', 'cone': 'orange'}
    
    for i, element in enumerate(elements):
        # Position elements in 3D space (simulate layout)
        x = i % 5  # Arrange in grid
        y = i // 5
        z = 0
        
        positions_x.append(x)
        positions_y.append(y)
        positions_z.append(z)
        
        # Size based on volume
        el_type = element.get('type', 'cube')
        if el_type == 'cube':
            volume = element.get('width', 10) * element.get('height', 10) * element.get('depth', 10)
        elif el_type == 'sphere':
            radius = element.get('radius', 5)
            volume = (4/3) * np.pi * radius**3
        elif el_type == 'cylinder':
            radius = element.get('radius', 5)
            height = element.get('height', 10)
            volume = np.pi * radius**2 * height
        else:
            volume = 1000
            
        sizes.append(volume / 100)  # Scale for visualization
        colors.append(color_map.get(el_type, 'gray'))
    
    scatter = ax1.scatter(positions_x, positions_y, positions_z, 
                         s=sizes, c=colors, alpha=0.6, edgecolors='black')
    ax1.set_xlabel('X Position')
    ax1.set_ylabel('Y Position')
    ax1.set_zlabel('Z Position')
    ax1.set_title('3D Element Layout\\n(Size = Volume)')
    
    # 2. Volume comparison 3D bar chart
    ax2 = fig.add_subplot(2, 3, 2, projection='3d')
    
    element_indices = range(len(elements))
    volumes = [sizes[i] * 100 for i in range(len(elements))]  # Convert back to actual scale
    
    xpos = np.arange(len(elements))
    ypos = np.zeros(len(elements))
    zpos = np.zeros(len(elements))
    dx = np.ones(len(elements)) * 0.8
    dy = np.ones(len(elements)) * 0.8
    dz = volumes
    
    colors_bar = [color_map.get(el.get('type', 'unknown'), 'gray') for el in elements]
    ax2.bar3d(xpos, ypos, zpos, dx, dy, dz, color=colors_bar, alpha=0.7)
    ax2.set_xlabel('Element Index')
    ax2.set_ylabel('Y')
    ax2.set_zlabel('Volume')
    ax2.set_title('3D Volume Comparison')
    
    # 3. Material distribution pie chart
    ax3 = fig.add_subplot(2, 3, 3)
    
    from collections import Counter
    materials = [el.get('material', 'unknown') for el in elements]
    material_counts = Counter(materials)
    
    if material_counts:
        ax3.pie(material_counts.values(), labels=material_counts.keys(), 
               autopct='%1.1f%%', startangle=90)
        ax3.set_title('Material Distribution')
    
    # 4. Complexity vs Size analysis
    ax4 = fig.add_subplot(2, 3, 4)
    
    complexity_scores = []
    size_scores = []
    
    for element in elements:
        # Complexity based on geometry type
        el_type = element.get('type', 'unknown')
        complexity = {'cube': 1, 'cylinder': 2, 'cone': 3, 'sphere': 4}.get(el_type, 1)
        complexity_scores.append(complexity)
        
        # Size score
        if el_type == 'cube':
            max_dim = max(element.get('width', 10), element.get('height', 10), element.get('depth', 10))
        elif el_type in ['cylinder', 'cone']:
            max_dim = max(element.get('radius', 5) * 2, element.get('height', 10))
        elif el_type == 'sphere':
            max_dim = element.get('radius', 5) * 2
        else:
            max_dim = 10
        
        size_scores.append(max_dim)
    
    scatter2 = ax4.scatter(complexity_scores, size_scores, 
                          s=[v/10 for v in volumes], 
                          c=[color_map.get(el.get('type', 'unknown'), 'gray') for el in elements],
                          alpha=0.6, edgecolors='black')
    ax4.set_xlabel('Complexity Score')
    ax4.set_ylabel('Max Dimension')
    ax4.set_title('Complexity vs Size\\n(Bubble size = Volume)')
    ax4.grid(True, alpha=0.3)
    
    # 5. Manufacturing difficulty assessment
    ax5 = fig.add_subplot(2, 3, 5)
    
    difficulty_scores = []
    element_names = []
    
    for i, element in enumerate(elements):
        el_type = element.get('type', 'unknown')
        material = element.get('material', 'steel').lower()
        
        # Base difficulty by geometry
        geo_difficulty = {'cube': 1, 'cylinder': 2, 'cone': 3, 'sphere': 4}.get(el_type, 2)
        
        # Material difficulty
        mat_difficulty = {'plastic': 1, 'aluminum': 2, 'steel': 3, 'copper': 4, 'titanium': 5}.get(material, 3)
        
        # Combined difficulty
        total_difficulty = (geo_difficulty + mat_difficulty) / 2
        difficulty_scores.append(total_difficulty)
        element_names.append(f"{el_type} {i+1}")
    
    colors_difficulty = ['green' if d <= 2 else 'orange' if d <= 3 else 'red' for d in difficulty_scores]
    bars = ax5.bar(range(len(difficulty_scores)), difficulty_scores, 
                   color=colors_difficulty, alpha=0.7, edgecolor='black')
    ax5.set_xlabel('Element')
    ax5.set_ylabel('Manufacturing Difficulty')
    ax5.set_title('Manufacturing Difficulty Assessment')
    ax5.set_xticks(range(len(element_names)))
    ax5.set_xticklabels(element_names, rotation=45, ha='right')
    ax5.grid(True, alpha=0.3)
    
    # Add difficulty level labels
    for bar, score in zip(bars, difficulty_scores):
        height = bar.get_height()
        level = "Easy" if score <= 2 else "Medium" if score <= 3 else "Hard"
        ax5.text(bar.get_x() + bar.get_width()/2., height + 0.05,
                level, ha='center', va='bottom', fontsize=8)
    
    # 6. Multi-dimensional radar chart for overall assessment
    ax6 = fig.add_subplot(2, 3, 6, projection='polar')
    
    if elements:
        # Calculate average metrics
        avg_volume = np.mean(volumes)
        avg_complexity = np.mean(complexity_scores)
        avg_size = np.mean(size_scores)
        avg_difficulty = np.mean(difficulty_scores)
        
        # Normalize to 0-10 scale
        metrics = [
            min(10, avg_volume / 1000),  # Volume (scaled)
            avg_complexity * 2.5,       # Complexity
            min(10, avg_size / 10),      # Size (scaled)
            avg_difficulty * 2,          # Difficulty
            len(set(materials)) * 2      # Material diversity
        ]
        
        categories = ['Volume', 'Complexity', 'Size', 'Difficulty', 'Diversity']
        
        # Close the plot
        metrics += metrics[:1]
        
        angles = np.linspace(0, 2 * np.pi, len(categories), endpoint=False).tolist()
        angles += angles[:1]
        
        ax6.plot(angles, metrics, 'o-', linewidth=2, label='Project Metrics')
        ax6.fill(angles, metrics, alpha=0.25)
        ax6.set_xticks(angles[:-1])
        ax6.set_xticklabels(categories)
        ax6.set_ylim(0, 10)
        ax6.set_title('Overall Project Assessment\\n(0-10 scale)')
        ax6.grid(True)
    
    plt.tight_layout()
    plt.savefig('advanced_3d_visualization.png', dpi=150, bbox_inches='tight')
    plt.show()
    
    # Summary statistics
    print(f"\\n📈 VISUALIZATION SUMMARY:")
    print(f"Total elements visualized: {len(elements)}")
    print(f"Unique element types: {len(set(el.get('type', 'unknown') for el in elements))}")
    print(f"Unique materials: {len(set(el.get('material', 'unknown') for el in elements))}")
    print(f"Volume range: {min(volumes):.1f} - {max(volumes):.1f} cubic units")
    print(f"Average complexity: {np.mean(complexity_scores):.1f}/4")
    print(f"Average manufacturing difficulty: {np.mean(difficulty_scores):.1f}/5")
    
    # Generate interactive visualization code snippet
    print("\\n🎯 INTERACTIVE VISUALIZATION CODE:")
    print("# To create an interactive 3D plot with Plotly:")
    print("# import plotly.graph_objects as go")
    print("# fig = go.Figure(data=go.Scatter3d(")
    print("#     x=positions_x, y=positions_y, z=positions_z,")
    print("#     mode='markers',")
    print("#     marker=dict(size=sizes, color=colors)")
    print("# ))")
    print("# fig.show()")
    
else:
    print("⚠️ No CAD elements found for visualization")
    
    # Create sample visualization
    print("\\n📊 Creating sample visualization...")
    
    fig = plt.figure(figsize=(12, 8))
    ax = fig.add_subplot(111, projection='3d')
    
    # Sample data
    x = np.random.randn(50)
    y = np.random.randn(50)
    z = np.random.randn(50)
    colors = np.random.rand(50)
    sizes = np.random.rand(50) * 100
    
    scatter = ax.scatter(x, y, z, c=colors, s=sizes, alpha=0.6, cmap='viridis')
    ax.set_xlabel('X Axis')
    ax.set_ylabel('Y Axis')
    ax.set_zlabel('Z Axis')
    ax.set_title('Sample 3D Visualization\\n(No CAD elements provided)')
    
    plt.colorbar(scatter)
    plt.savefig('sample_3d_visualization.png', dpi=150, bbox_inches='tight')
    plt.show()
    
    print("Created sample 3D visualization to demonstrate capabilities")
`
  }
];

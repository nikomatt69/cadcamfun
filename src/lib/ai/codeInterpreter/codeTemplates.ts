// src/lib/ai/codeInterpreter/codeTemplates.ts
import { CodeTemplate } from "@/src/types/codeInterpreterTypes";
import { Element } from "@/src/store/elementsStore"; // Import Element type

/**
 * Code templates for common CAD/CAM operations
 */
export class CodeTemplates {
  private templates: Map<string, CodeTemplate> = new Map();

  constructor() {
    this.initializeTemplates();
  }

  getTemplate(id: string, cadElements?: Element[]): CodeTemplate | undefined {
    const originalTemplate = this.templates.get(id);
    if (!originalTemplate) {
      return undefined;
    }

    // Create a deep copy to avoid modifying the original template
    const templateCopy = JSON.parse(JSON.stringify(originalTemplate));

    // Replace placeholder with actual CAD elements or an empty array if not provided
    const elementsString = JSON.stringify(cadElements || [], null, 2);
    templateCopy.code = templateCopy.code.replace(/{{CAD_ELEMENTS}}/g, elementsString);

    return templateCopy;
  }

  getAllTemplates(): CodeTemplate[] {
    return Array.from(this.templates.values());
  }

  getTemplatesByCategory(category: string): CodeTemplate[] {
    return Array.from(this.templates.values()).filter(t => t.category === category);
  }

  private initializeTemplates(): void {
    // CAD Analysis Template
    this.templates.set("cad_analysis", {
      id: "cad_analysis",
      name: "CAD Element Analysis",
      description: "Comprehensive analysis of CAD elements including geometry, volume, and properties",
      category: "cad",
      code: `
import json
import numpy as np
import matplotlib.pyplot as plt
from collections import Counter
import math

# Load CAD elements
elements = {{CAD_ELEMENTS}}
analysis_type = "{{ANALYSIS_TYPE}}"
material_properties = {{MATERIAL_PROPERTIES}} if "{{MATERIAL_PROPERTIES}}" != "{{MATERIAL_PROPERTIES}}" else {}

def calculate_element_volume(element):
    """Calculate volume for different element types"""
    el_type = element.get('type', 'unknown')
    
    if el_type == 'cube':
        return element.get('width', 0) * element.get('height', 0) * element.get('depth', 0)
    elif el_type == 'sphere':
        radius = element.get('radius', 0)
        return (4/3) * math.pi * radius**3
    elif el_type == 'cylinder':
        radius = element.get('radius', 0)
        height = element.get('height', 0)
        return math.pi * radius**2 * height
    elif el_type == 'cone':
        radius = element.get('radius', 0)
        height = element.get('height', 0)
        return (1/3) * math.pi * radius**2 * height
    elif el_type == 'torus':
        radius = element.get('radius', 0)
        tube = element.get('tube', radius * 0.3)
        return 2 * math.pi**2 * radius * tube**2
    else:
        return 0

def calculate_element_surface_area(element):
    """Calculate surface area for different element types"""
    el_type = element.get('type', 'unknown')
    
    if el_type == 'cube':
        w, h, d = element.get('width', 0), element.get('height', 0), element.get('depth', 0)
        return 2 * (w*h + w*d + h*d)
    elif el_type == 'sphere':
        radius = element.get('radius', 0)
        return 4 * math.pi * radius**2
    elif el_type == 'cylinder':
        radius = element.get('radius', 0)
        height = element.get('height', 0)
        return 2 * math.pi * radius * (radius + height)
    elif el_type == 'cone':
        radius = element.get('radius', 0)
        height = element.get('height', 0)
        slant_height = math.sqrt(radius**2 + height**2)
        return math.pi * radius * (radius + slant_height)
    else:
        return 0

def analyze_geometry():
    """Perform geometric analysis"""
    total_elements = len(elements)
    element_types = Counter([el.get('type', 'unknown') for el in elements])
    
    # Calculate total volume and surface area
    total_volume = sum(calculate_element_volume(el) for el in elements)
    total_surface_area = sum(calculate_element_surface_area(el) for el in elements)
    
    # Position analysis
    positions = [(el.get('x', 0), el.get('y', 0), el.get('z', 0)) for el in elements]
    
    if positions:
        x_coords = [pos[0] for pos in positions]
        y_coords = [pos[1] for pos in positions]
        z_coords = [pos[2] for pos in positions]
        
        centroid = (np.mean(x_coords), np.mean(y_coords), np.mean(z_coords))
        bounding_box = {
            'min': (min(x_coords), min(y_coords), min(z_coords)),
            'max': (max(x_coords), max(y_coords), max(z_coords))
        }
        
        # Calculate dimensions
        dimensions = (
            max(x_coords) - min(x_coords),
            max(y_coords) - min(y_coords),
            max(z_coords) - min(z_coords)
        )
    else:
        centroid = (0, 0, 0)
        bounding_box = {'min': (0, 0, 0), 'max': (0, 0, 0)}
        dimensions = (0, 0, 0)
    
    return {
        'total_elements': total_elements,
        'element_types': dict(element_types),
        'total_volume': total_volume,
        'total_surface_area': total_surface_area,
        'centroid': centroid,
        'bounding_box': bounding_box,
        'dimensions': dimensions
    }

def analyze_structural():
    """Perform structural analysis (simplified)"""
    if not material_properties:
        return {'error': 'Material properties required for structural analysis'}
    
    geometry = analyze_geometry()
    density = material_properties.get('density', 7850)  # Default steel density
    
    # Calculate total mass
    total_mass = geometry['total_volume'] * density / 1000000  # Convert mm³ to kg
    
    # Simplified stress analysis
    elastic_modulus = material_properties.get('elasticModulus', 200000)  # MPa
    yield_strength = material_properties.get('yieldStrength', 250)  # MPa
    
    return {
        'total_mass': total_mass,
        'material_density': density,
        'elastic_modulus': elastic_modulus,
        'yield_strength': yield_strength,
        'geometry': geometry
    }

def create_visualization():
    """Create visualization of the analysis"""
    plt.figure(figsize=(15, 10))
    
    # Element distribution
    plt.subplot(2, 3, 1)
    element_types = Counter([el.get('type', 'unknown') for el in elements])
    plt.pie(element_types.values(), labels=element_types.keys(), autopct='%1.1f%%')
    plt.title('Element Type Distribution')
    
    # Position scatter
    plt.subplot(2, 3, 2)
    x_coords = [el.get('x', 0) for el in elements]
    y_coords = [el.get('y', 0) for el in elements]
    colors = [hash(el.get('type', 'unknown')) % 10 for el in elements]
    plt.scatter(x_coords, y_coords, c=colors, alpha=0.7)
    plt.xlabel('X Position')
    plt.ylabel('Y Position')
    plt.title('Element Positions (XY Plane)')
    plt.grid(True)
    
    # Volume distribution
    plt.subplot(2, 3, 3)
    volumes = [calculate_element_volume(el) for el in elements if calculate_element_volume(el) > 0]
    if volumes:
        plt.hist(volumes, bins=min(20, len(volumes)), alpha=0.7)
        plt.xlabel('Volume')
        plt.ylabel('Count')
        plt.title('Volume Distribution')
    
    # Size analysis
    plt.subplot(2, 3, 4)
    sizes = []
    for el in elements:
        if 'radius' in el:
            sizes.append(el['radius'])
        elif 'width' in el:
            sizes.append(max(el.get('width', 0), el.get('height', 0), el.get('depth', 0)))
        else:
            sizes.append(1)
    
    if sizes:
        plt.hist(sizes, bins=min(20, len(sizes)), alpha=0.7)
        plt.xlabel('Maximum Dimension')
        plt.ylabel('Count')
        plt.title('Size Distribution')
    
    # Color analysis
    plt.subplot(2, 3, 5)
    colors = [el.get('color', '#cccccc') for el in elements]
    color_counts = Counter(colors)
    plt.pie(color_counts.values(), labels=color_counts.keys(), autopct='%1.1f%%')
    plt.title('Color Distribution')
    
    # Summary text
    plt.subplot(2, 3, 6)
    geometry = analyze_geometry()
    summary_text = f"""Analysis Summary:
    
Elements: {geometry['total_elements']}
Types: {len(geometry['element_types'])}
Total Volume: {geometry['total_volume']:.2f} mm³
Surface Area: {geometry['total_surface_area']:.2f} mm²
Dimensions: {geometry['dimensions'][0]:.1f} × {geometry['dimensions'][1]:.1f} × {geometry['dimensions'][2]:.1f} mm
    """
    plt.text(0.1, 0.5, summary_text, fontsize=10, verticalalignment='center')
    plt.axis('off')
    plt.title('Summary')
    
    plt.tight_layout()
    plt.savefig('cad_analysis_visualization.png', dpi=150, bbox_inches='tight')
    plt.show()

# Perform analysis based on type
if analysis_type == 'geometry':
    result = analyze_geometry()
elif analysis_type == 'structural':
    result = analyze_structural()
else:
    result = analyze_geometry()

# Create visualization
create_visualization()

# Output results
print(json.dumps(result, indent=2))
`,
      requiredInputs: ["elements", "analysis_type"],
      expectedOutputs: ["geometry_analysis", "visualization"],
      examples: ["Analyze CAD model geometry", "Calculate volumes and centroids"]
    });

    // Data Visualization Template
    this.templates.set("data_visualization", {
      id: "data_visualization",
      name: "Data Visualization",
      description: "Create charts and graphs from data",
      category: "visualization",
      code: `
import json
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
from datetime import datetime

# Load data
data = {{DATA}}
chart_type = "{{CHART_TYPE}}"
title = "{{TITLE}}"

# Set style
plt.style.use('seaborn-v0_8')
sns.set_palette("husl")

def create_chart():
    """Create visualization based on chart type"""
    fig, ax = plt.subplots(figsize=(12, 8))
    
    if chart_type == 'line':
        if isinstance(data[0], dict) and 'x' in data[0] and 'y' in data[0]:
            x_vals = [point['x'] for point in data]
            y_vals = [point['y'] for point in data]
            plt.plot(x_vals, y_vals, marker='o', linewidth=2, markersize=6)
        else:
            plt.plot(data, marker='o', linewidth=2, markersize=6)
        plt.xlabel('X Values')
        plt.ylabel('Y Values')
        
    elif chart_type == 'bar':
        if isinstance(data[0], dict) and 'label' in data[0] and 'value' in data[0]:
            labels = [item['label'] for item in data]
            values = [item['value'] for item in data]
            plt.bar(labels, values)
            plt.xticks(rotation=45)
        else:
            plt.bar(range(len(data)), data)
        plt.xlabel('Categories')
        plt.ylabel('Values')
        
    elif chart_type == 'scatter':
        if isinstance(data[0], dict) and 'x' in data[0] and 'y' in data[0]:
            x_vals = [point['x'] for point in data]
            y_vals = [point['y'] for point in data]
            sizes = [point.get('size', 50) for point in data]
            colors = [point.get('color', 'blue') for point in data]
            plt.scatter(x_vals, y_vals, s=sizes, c=colors, alpha=0.7)
        else:
            plt.scatter(range(len(data)), data, alpha=0.7)
        plt.xlabel('X Values')
        plt.ylabel('Y Values')
        
    elif chart_type == 'histogram':
        plt.hist(data, bins=30, alpha=0.7, edgecolor='black')
        plt.xlabel('Values')
        plt.ylabel('Frequency')
        
    elif chart_type == 'pie':
        if isinstance(data[0], dict) and 'label' in data[0] and 'value' in data[0]:
            labels = [item['label'] for item in data]
            values = [item['value'] for item in data]
            plt.pie(values, labels=labels, autopct='%1.1f%%')
        else:
            plt.pie(data, autopct='%1.1f%%')
            
    else:
        # Default to line chart
        plt.plot(data, marker='o')
        plt.xlabel('Index')
        plt.ylabel('Values')
    
    plt.title(title, fontsize=16, fontweight='bold')
    plt.grid(True, alpha=0.3)
    plt.tight_layout()
    
    # Save chart
    filename = f'{chart_type}_chart_{datetime.now().strftime("%Y%m%d_%H%M%S")}.png'
    plt.savefig(filename, dpi=300, bbox_inches='tight')
    plt.show()
    
    return filename

# Create the chart
chart_file = create_chart()

# Generate summary
summary = {
    'chart_type': chart_type,
    'data_points': len(data),
    'chart_file': chart_file,
    'title': title
}

print(json.dumps(summary, indent=2))
`,
      requiredInputs: ["data", "chart_type"],
      expectedOutputs: ["chart_file"],
      examples: ["Create line chart", "Generate histogram", "Make scatter plot"]
    });

    // G-code Optimization Template
    this.templates.set("gcode_optimization", {
      id: "gcode_optimization",
      name: "G-code Analysis and Optimization",
      description: "Analyze and optimize G-code for machining efficiency",
      category: "cam",
      code: `
import re
import json
import math
import matplotlib.pyplot as plt
from collections import defaultdict

# Input data
gcode = """{{GCODE}}"""
machine_specs = {{MACHINE_SPECS}}
tool = {{TOOL}}
material = {{MATERIAL}}

def parse_gcode():
    """Parse G-code and extract information"""
    lines = gcode.strip().split('\\n')
    
    parsed_commands = []
    current_position = {'X': 0, 'Y': 0, 'Z': 0}
    current_feedrate = 0
    current_spindle = 0
    
    for line_num, line in enumerate(lines, 1):
        line = line.strip()
        if not line or line.startswith(';') or line.startswith('('):
            continue
            
        # Extract G-code command
        command_match = re.match(r'([GM]\\d+)', line)
        if command_match:
            command = command_match.group(1)
            
            # Extract coordinates
            coords = {}
            for axis in ['X', 'Y', 'Z']:
                coord_match = re.search(f'{axis}([+-]?\\d*\\.?\\d+)', line)
                if coord_match:
                    coords[axis] = float(coord_match.group(1))
            
            # Extract feed rate
            feed_match = re.search(r'F([+-]?\\d*\\.?\\d+)', line)
            if feed_match:
                current_feedrate = float(feed_match.group(1))
            
            # Extract spindle speed
            spindle_match = re.search(r'S([+-]?\\d*\\.?\\d+)', line)
            if spindle_match:
                current_spindle = float(spindle_match.group(1))
            
            parsed_commands.append({
                'line': line_num,
                'command': command,
                'coordinates': coords,
                'feedrate': current_feedrate,
                'spindle': current_spindle,
                'raw': line
            })
            
            # Update current position
            current_position.update(coords)
    
    return parsed_commands

def analyze_toolpath():
    """Analyze toolpath for optimization opportunities"""
    commands = parse_gcode()
    
    # Calculate distances and times
    total_distance = 0
    cutting_distance = 0
    rapid_distance = 0
    total_time = 0
    
    position = {'X': 0, 'Y': 0, 'Z': 0}
    
    for cmd in commands:
        if cmd['coordinates']:
            # Calculate distance
            new_pos = position.copy()
            new_pos.update(cmd['coordinates'])
            
            distance = math.sqrt(
                (new_pos['X'] - position['X'])**2 + 
                (new_pos['Y'] - position['Y'])**2 + 
                (new_pos['Z'] - position['Z'])**2
            )
            
            total_distance += distance
            
            # Classify move type
            if cmd['command'] in ['G00']:  # Rapid move
                rapid_distance += distance
                # Assume max rapid speed
                total_time += distance / machine_specs.get('maxRapidSpeed', 10000)  # mm/min
            elif cmd['command'] in ['G01', 'G02', 'G03']:  # Feed move
                cutting_distance += distance
                if cmd['feedrate'] > 0:
                    total_time += distance / cmd['feedrate']  # minutes
            
            position = new_pos
    
    return {
        'total_commands': len(commands),
        'total_distance': total_distance,
        'cutting_distance': cutting_distance,
        'rapid_distance': rapid_distance,
        'total_time_minutes': total_time,
        'average_feedrate': cutting_distance / total_time if total_time > 0 else 0
    }

def suggest_optimizations():
    """Suggest optimization strategies"""
    analysis = analyze_toolpath()
    commands = parse_gcode()
    
    suggestions = []
    
    # Check feed rates
    feedrates = [cmd['feedrate'] for cmd in commands if cmd['feedrate'] > 0]
    if feedrates:
        max_feed = max(feedrates)
        machine_max = machine_specs.get('maxFeedRate', 5000)
        
        if max_feed < machine_max * 0.8:
            suggestions.append({
                'type': 'feedrate',
                'description': f'Feed rates could be increased. Current max: {max_feed}, Machine max: {machine_max}',
                'potential_time_saving': analysis['total_time_minutes'] * 0.2
            })
    
    # Check spindle speeds
    spindle_speeds = [cmd['spindle'] for cmd in commands if cmd['spindle'] > 0]
    if spindle_speeds:
        max_spindle = max(spindle_speeds)
        machine_max = machine_specs.get('maxSpindleSpeed', 20000)
        
        if max_spindle < machine_max * 0.8:
            suggestions.append({
                'type': 'spindle',
                'description': f'Spindle speed could be optimized. Current max: {max_spindle}, Machine max: {machine_max}',
                'potential_improvement': 'Better surface finish and tool life'
            })
    
    # Check rapid moves
    rapid_ratio = analysis['rapid_distance'] / analysis['total_distance'] if analysis['total_distance'] > 0 else 0
    if rapid_ratio > 0.5:
        suggestions.append({
            'type': 'toolpath',
            'description': 'High ratio of rapid moves suggests toolpath could be optimized',
            'potential_time_saving': analysis['total_time_minutes'] * 0.1
        })
    
    return suggestions

def create_analysis_visualization():
    """Create visualization of G-code analysis"""
    commands = parse_gcode()
    analysis = analyze_toolpath()
    
    plt.figure(figsize=(15, 10))
    
    # Toolpath visualization
    plt.subplot(2, 3, 1)
    x_coords = []
    y_coords = []
    position = {'X': 0, 'Y': 0, 'Z': 0}
    
    for cmd in commands:
        if cmd['coordinates']:
            position.update(cmd['coordinates'])
            x_coords.append(position['X'])
            y_coords.append(position['Y'])
    
    if x_coords and y_coords:
        plt.plot(x_coords, y_coords, 'b-', linewidth=1, alpha=0.7)
        plt.scatter(x_coords[0], y_coords[0], color='green', s=100, label='Start')
        plt.scatter(x_coords[-1], y_coords[-1], color='red', s=100, label='End')
        plt.xlabel('X (mm)')
        plt.ylabel('Y (mm)')
        plt.title('Toolpath (XY Plane)')
        plt.legend()
        plt.grid(True)
        plt.axis('equal')
    
    # Feed rate distribution
    plt.subplot(2, 3, 2)
    feedrates = [cmd['feedrate'] for cmd in commands if cmd['feedrate'] > 0]
    if feedrates:
        plt.hist(feedrates, bins=20, alpha=0.7)
        plt.xlabel('Feed Rate (mm/min)')
        plt.ylabel('Frequency')
        plt.title('Feed Rate Distribution')
    
    # Command distribution
    plt.subplot(2, 3, 3)
    command_counts = defaultdict(int)
    for cmd in commands:
        command_counts[cmd['command']] += 1
    
    plt.pie(command_counts.values(), labels=command_counts.keys(), autopct='%1.1f%%')
    plt.title('G-code Command Distribution')
    
    # Distance analysis
    plt.subplot(2, 3, 4)
    distances = ['Cutting', 'Rapid']
    values = [analysis['cutting_distance'], analysis['rapid_distance']]
    plt.bar(distances, values, color=['orange', 'blue'])
    plt.ylabel('Distance (mm)')
    plt.title('Distance Breakdown')
    
    # Time analysis
    plt.subplot(2, 3, 5)
    plt.text(0.1, 0.8, f"Total Time: {analysis['total_time_minutes']:.2f} min", fontsize=12)
    plt.text(0.1, 0.7, f"Total Distance: {analysis['total_distance']:.1f} mm", fontsize=12)
    plt.text(0.1, 0.6, f"Cutting Distance: {analysis['cutting_distance']:.1f} mm", fontsize=12)
    plt.text(0.1, 0.5, f"Commands: {analysis['total_commands']}", fontsize=12)
    plt.text(0.1, 0.4, f"Avg Feed: {analysis['average_feedrate']:.0f} mm/min", fontsize=12)
    plt.axis('off')
    plt.title('Analysis Summary')
    
    # Z-height profile
    plt.subplot(2, 3, 6)
    z_coords = []
    position = {'X': 0, 'Y': 0, 'Z': 0}
    
    for cmd in commands:
        if cmd['coordinates'] and 'Z' in cmd['coordinates']:
            position['Z'] = cmd['coordinates']['Z']
        z_coords.append(position['Z'])
    
    if z_coords:
        plt.plot(z_coords, 'g-', linewidth=2)
        plt.xlabel('Command Number')
        plt.ylabel('Z Height (mm)')
        plt.title('Z-Height Profile')
        plt.grid(True)
    
    plt.tight_layout()
    plt.savefig('gcode_analysis.png', dpi=150, bbox_inches='tight')
    plt.show()

# Perform analysis
analysis_result = analyze_toolpath()
optimizations = suggest_optimizations()

# Create visualization
create_analysis_visualization()

# Compile results
result = {
    'analysis': analysis_result,
    'optimizations': optimizations,
    'machine_specs': machine_specs,
    'tool': tool,
    'material': material
}

print(json.dumps(result, indent=2))
`,
      requiredInputs: ["gcode", "machine_specs", "tool", "material"],
      expectedOutputs: ["analysis_result", "optimization_suggestions"],
      examples: ["Optimize cutting parameters", "Analyze machining time", "Improve toolpath efficiency"]
    });

    // Manufacturing Cost Analysis Template
    this.templates.set("manufacturing_cost", {
      id: "manufacturing_cost",
      name: "Manufacturing Cost Analysis",
      description: "Calculate and analyze manufacturing costs",
      category: "analysis",
      code: `
import json
import numpy as np
import matplotlib.pyplot as plt

# Input parameters (will be replaced by actual values)
elements = {{CAD_ELEMENTS}} if "{{CAD_ELEMENTS}}" != "{{CAD_ELEMENTS}}" else []
material_cost_per_kg = {{MATERIAL_COST_PER_KG}} if "{{MATERIAL_COST_PER_KG}}" != "{{MATERIAL_COST_PER_KG}}" else 5.0
machine_hourly_rate = {{MACHINE_HOURLY_RATE}} if "{{MACHINE_HOURLY_RATE}}" != "{{MACHINE_HOURLY_RATE}}" else 75.0
setup_time_hours = {{SETUP_TIME_HOURS}} if "{{SETUP_TIME_HOURS}}" != "{{SETUP_TIME_HOURS}}" else 0.5
machining_time_hours = {{MACHINING_TIME_HOURS}} if "{{MACHINING_TIME_HOURS}}" != "{{MACHINING_TIME_HOURS}}" else 1.0

def calculate_material_cost():
    """Calculate material costs based on volume"""
    total_volume_mm3 = 0
    material_density = 7.85  # Steel density g/cm³
    
    for element in elements:
        if element.get('type') == 'cube':
            volume = element.get('width', 0) * element.get('height', 0) * element.get('depth', 0)
        elif element.get('type') == 'sphere':
            radius = element.get('radius', 0)
            volume = (4/3) * np.pi * radius**3
        elif element.get('type') == 'cylinder':
            radius = element.get('radius', 0)
            height = element.get('height', 0)
            volume = np.pi * radius**2 * height
        else:
            volume = 0
        
        total_volume_mm3 += volume
    
    # Convert to kg
    total_volume_cm3 = total_volume_mm3 / 1000
    total_mass_kg = total_volume_cm3 * material_density / 1000
    
    material_cost = total_mass_kg * material_cost_per_kg
    
    return {
        'volume_mm3': total_volume_mm3,
        'volume_cm3': total_volume_cm3,
        'mass_kg': total_mass_kg,
        'cost_usd': material_cost
    }

def calculate_machining_cost():
    """Calculate machining costs"""
    setup_cost = setup_time_hours * machine_hourly_rate
    machining_cost = machining_time_hours * machine_hourly_rate
    total_machining_cost = setup_cost + machining_cost
    
    return {
        'setup_cost': setup_cost,
        'machining_cost': machining_cost,
        'total_cost': total_machining_cost,
        'setup_time_hours': setup_time_hours,
        'machining_time_hours': machining_time_hours,
        'hourly_rate': machine_hourly_rate
    }

def calculate_total_cost():
    """Calculate total manufacturing cost"""
    material = calculate_material_cost()
    machining = calculate_machining_cost()
    
    # Additional costs (overhead, tooling, etc.)
    overhead_percentage = 0.2  # 20% overhead
    overhead_cost = (material['cost_usd'] + machining['total_cost']) * overhead_percentage
    
    total_cost = material['cost_usd'] + machining['total_cost'] + overhead_cost
    
    return {
        'material_cost': material['cost_usd'],
        'machining_cost': machining['total_cost'],
        'overhead_cost': overhead_cost,
        'total_cost': total_cost,
        'cost_breakdown': {
            'material_percentage': (material['cost_usd'] / total_cost) * 100,
            'machining_percentage': (machining['total_cost'] / total_cost) * 100,
            'overhead_percentage': (overhead_cost / total_cost) * 100
        }
    }

def create_cost_visualization():
    """Create cost breakdown visualization"""
    cost_analysis = calculate_total_cost()
    
    plt.figure(figsize=(12, 8))
    
    # Cost breakdown pie chart
    plt.subplot(2, 2, 1)
    costs = [
        cost_analysis['material_cost'],
        cost_analysis['machining_cost'],
        cost_analysis['overhead_cost']
    ]
    labels = ['Material', 'Machining', 'Overhead']
    colors = ['skyblue', 'lightcoral', 'lightgreen']
    
    plt.pie(costs, labels=labels, colors=colors, autopct='%1.1f%%', startangle=90)
    plt.title('Cost Breakdown')
    
    # Cost per element
    plt.subplot(2, 2, 2)
    if elements:
        cost_per_element = cost_analysis['total_cost'] / len(elements)
        element_types = [el.get('type', 'unknown') for el in elements]
        type_counts = {}
        for t in element_types:
            type_counts[t] = type_counts.get(t, 0) + 1
        
        types = list(type_counts.keys())
        counts = list(type_counts.values())
        costs_per_type = [cost_per_element * count for count in counts]
        
        plt.bar(types, costs_per_type, color='orange', alpha=0.7)
        plt.title('Cost by Element Type')
        plt.ylabel('Cost ($)')
        plt.xticks(rotation=45)
    
    # Time breakdown
    plt.subplot(2, 2, 3)
    machining_data = calculate_machining_cost()
    times = [machining_data['setup_time_hours'], machining_data['machining_time_hours']]
    time_labels = ['Setup', 'Machining']
    
    plt.bar(time_labels, times, color=['lightblue', 'salmon'])
    plt.title('Time Breakdown')
    plt.ylabel('Hours')
    
    # Cost summary
    plt.subplot(2, 2, 4)
    summary_text = f"""Cost Summary:
    
Material: \${cost_analysis['material_cost']:.2f}
Machining: \${cost_analysis['machining_cost']:.2f}
Overhead: \${cost_analysis['overhead_cost']:.2f}
Total: \${cost_analysis['total_cost']:.2f}

Cost per element: \${cost_analysis['total_cost']/max(len(elements), 1):.2f}
    """
    plt.text(0.1, 0.5, summary_text, fontsize=10, verticalalignment='center')
    plt.axis('off')
    plt.title('Summary')
    
    plt.tight_layout()
    plt.savefig('manufacturing_cost_analysis.png', dpi=150, bbox_inches='tight')
    plt.show()

# Perform analysis
material_analysis = calculate_material_cost()
machining_analysis = calculate_machining_cost()
total_cost_analysis = calculate_total_cost()

# Create visualization
create_cost_visualization()

# Compile results
result = {
    'material_analysis': material_analysis,
    'machining_analysis': machining_analysis,
    'total_cost_analysis': total_cost_analysis,
    'parameters': {
        'material_cost_per_kg': material_cost_per_kg,
        'machine_hourly_rate': machine_hourly_rate,
        'setup_time_hours': setup_time_hours,
        'machining_time_hours': machining_time_hours
    }
}

print(json.dumps(result, indent=2))
`,
      requiredInputs: ["elements", "material_cost", "machine_rate"],
      expectedOutputs: ["cost_analysis", "cost_breakdown"],
      examples: ["Calculate part cost", "Compare manufacturing options", "Optimize for cost"]
    });
  }
}

// Export singleton instance
export const codeTemplates = new CodeTemplates();

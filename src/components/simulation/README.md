# Integrated FEA Simulation System

This system provides **Finite Element Analysis (FEA)** simulation functionality fully integrated into the CAD, supporting structural, thermal, and coupled analyses.

## 🚀 Main Components

### SimulationManager
The main component that manages the entire simulation workflow:
- **Setup**: Configuration of parameters, materials, loads, and constraints
- **Preview**: Visual preview of loads and constraints
- **Execution**: Simulation execution with progressive feedback
- **Results**: Results visualization with deformed mesh and color maps

### SimulationToolbar
Integrated toolbar in the CAD that provides:
- Main button to open/close simulation
- Quick selection of analysis type (Stress/Thermal/Coupled)
- Status indicators and selected elements
- Quick actions (fast analysis, preview)

### SimulationInteractionLayer
Interaction layer that handles:
- Visual selection of elements for simulation
- Overlay indicators for simulatable elements
- Keyboard shortcuts
- Visual feedback during selection

### CADCanvasWithSimulation
Complete wrapper that integrates:
- Main CAD canvas
- All simulation components
- State and effects management

## 🛠️ Custom Hooks

### useSimulation
Main hook for managing simulation state:

```typescript
const simulation = useSimulation();

// State
simulation.isSimulationOpen          // Simulation open
simulation.selectedElementsForSimulation  // Selected elements
simulation.simulationMode           // Mode: idle/selecting/configuring/running
simulation.simulationResults        // Simulation results

// Actions
simulation.openSimulation()         // Open simulation
simulation.closeSimulation()        // Close simulation
simulation.addElementToSimulation(id)    // Add element
simulation.canSimulateElement(id)   // Check if simulatable
```

### useSimulationEffects
Hook for visual effects and textures:

```typescript
const effects = useSimulationEffects();

// Create color maps for stress and temperature
const stressMap = effects.createStressColorMap(values, maxStress);
const tempMap = effects.createTemperatureColorMap(temps, min, max);

// Create visual indicators
const arrows = effects.createForceArrows(forces);
const markers = effects.createConstraintMarkers(constraints);
```

## 📋 Usage

### 1. Basic Integration
```tsx
import CADCanvasWithSimulation from '@/components/cad/CADCanvasWithSimulation';

function MyCADApp() {
  return (
    <CADCanvasWithSimulation 
      width="100%" 
      height="100vh"
      allowDragDrop={true}
    />
  );
}
```

### 2. Manual Integration
```tsx
import { useSimulation } from '@/hooks/useSimulation';
import SimulationManager from '@/components/simulation/SimulationManager';

function CustomCAD() {
  const simulation = useSimulation();
  
  return (
    <div className="relative">
      <MyCADCanvas />
      <SimulationManager
        isOpen={simulation.isSimulationOpen}
        onClose={simulation.closeSimulation}
        selectedMeshIds={simulation.selectedElementsForSimulation}
      />
    </div>
  );
}
```

## ⌨️ Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Ctrl+Shift+S` | Open/Close simulation |
| `F9` | Toggle selection mode |
| `Esc` | Clear selection or close |

## 🎯 Supported Simulation Types

### 1. Structural Analysis (Stress)
- **Input**: Forces, constraints, material
- **Output**: von Mises stress, deformations, safety factor
- **Visualization**: Deformed mesh, stress color maps

### 2. Thermal Analysis
- **Input**: Heat sources, thermal boundaries, environment
- **Output**: Temperature distribution, thermal flows
- **Visualization**: Temperature maps, transient animations

### 3. Coupled Analysis
- **Input**: Combined stress + thermal
- **Output**: Combined thermo-mechanical effects
- **Visualization**: Thermal stresses, expansions

## 🔧 Advanced Configuration

### Custom Materials
```typescript
const customMaterial = {
  id: 'stainless-steel',
  name: 'Stainless Steel 316L',
  youngsModulus: 200000,      // MPa
  poissonRatio: 0.3,
  density: 8000,              // kg/m³
  thermalConductivity: 16.2,  // W/m·K
  specificHeat: 500,          // J/kg·K
  thermalExpansion: 16e-6     // 1/K
};
```

### Simulatable Elements
The system supports these CAD element types:
- `cube`, `sphere`, `cylinder`, `cone`, `torus`
- `extrude`, `revolve`, `loft`, `sweep`
- `component`, `mesh`, `imported`

### Performance and Optimizations
- **WASM Integration**: Accelerated FEA calculations via WebAssembly
- **LOD**: Automatic Level of Detail for large models
- **Caching**: Results caching for repeated simulations
- **Workers**: Background processing for responsive UI

## 🎨 UI Customization

### Themes and Colors
```scss
// Customizable CSS variables
:root {
  --simulation-stress-color: #ff0000;
  --simulation-thermal-color: #ff8c00;
  --simulation-coupled-color: #8b00ff;
  --simulation-safe-color: #00ff00;
}
```

### Extensible Components
All components accept custom `className` and can be completely restyled with Tailwind CSS.

## 🚨 Limitations

### Current Version
- **Solver**: Simplified implementation (placeholder for real solvers)
- **Mesh**: Basic mesh generation from THREE.js geometries
- **Materials**: Limited library of predefined materials
- **Validation**: Basic checks on input parameters

### Future Developments
- Integration with professional FEA solvers (OpenFOAM, CalculiX)
- Advanced mesh generation with quality control
- Dynamic and modal analysis
- Topology optimization
- Export results in standard formats (VTK, Paraview)

## 📚 Complete Examples

See the `/examples` folder for complete examples of:
- Structural analysis of a beam
- Thermal analysis of a heat sink
- Coupled simulation of a mechanical component

## 🤝 Contributing

This project welcomes contributions and suggestions. Most contributions require you to agree to a Contributor License Agreement (CLA) declaring that you have the right to, and actually do, grant us the rights to use your contribution.

When you submit a pull request, a CLA bot will automatically determine whether you need to provide a CLA and decorate the PR appropriately (e.g., status check, comment). Simply follow the instructions provided by the bot.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details. 
// CAD Code Interpreter Templates Index
// src/lib/ai/codeInterpreter/templates/index.ts

export interface CADTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  difficulty: "basic" | "intermediate" | "advanced";
  estimatedTime: string;
  requiredPackages: string[];
  outputTypes: string[];
  code: string;
}

export interface TemplateCategory {
  id: string;
  name: string;
  description: string;
  icon: string;
}

// Template categories
export const TEMPLATE_CATEGORIES: TemplateCategory[] = [
  {
    id: "geometric",
    name: "Geometric Analysis",
    description: "Volume, surface area, and dimensional analysis",
    icon: "📐"
  },
  {
    id: "manufacturing",
    name: "Manufacturing Analysis",
    description: "Cost, time, and production feasibility analysis",
    icon: "🏭"
  },
  {
    id: "material",
    name: "Material Analysis",
    description: "Material properties, weight, and optimization",
    icon: "🧱"
  },
  {
    id: "structural",
    name: "Structural Analysis",
    description: "Stress, strength, and structural integrity",
    icon: "🏗️"
  },
  {
    id: "optimization",
    name: "Design Optimization",
    description: "Performance optimization and design improvements",
    icon: "⚡"
  },
  {
    id: "quality",
    name: "Quality Control",
    description: "Tolerance analysis and quality metrics",
    icon: "✅"
  },
  {
    id: "sustainability",
    name: "Sustainability",
    description: "Environmental impact and resource efficiency",
    icon: "🌱"
  },
  {
    id: "visualization",
    name: "Visualization",
    description: "Advanced charts and data visualization",
    icon: "📊"
  }
];

// Import all template modules
import { geometricTemplates } from "./geometric";
// import { manufacturingTemplates } from './manufacturing'; // Temporarily disabled due to syntax errors
// import { materialTemplates } from './material'; // Temporarily disabled due to syntax errors
import { structuralTemplates } from "./structural";
import { optimizationTemplates } from "./optimization";
import { qualityTemplates } from "./quality";
import { sustainabilityTemplates } from "./sustainability";
import { visualizationTemplates } from "./visualization";

// Combine all templates
export const ALL_CAD_TEMPLATES: CADTemplate[] = [
  ...geometricTemplates,
  // ...manufacturingTemplates, // Temporarily disabled
  // ...materialTemplates, // Temporarily disabled
  ...structuralTemplates,
  ...optimizationTemplates,
  ...qualityTemplates,
  ...sustainabilityTemplates,
  ...visualizationTemplates
];

// Helper functions
export const getTemplatesByCategory = (categoryId: string): CADTemplate[] => {
  return ALL_CAD_TEMPLATES.filter(template => template.category === categoryId);
};

export const getTemplateById = (templateId: string): CADTemplate | undefined => {
  return ALL_CAD_TEMPLATES.find(template => template.id === templateId);
};

export const getTemplatesByDifficulty = (difficulty: "basic" | "intermediate" | "advanced"): CADTemplate[] => {
  return ALL_CAD_TEMPLATES.filter(template => template.difficulty === difficulty);
};

export const searchTemplates = (query: string): CADTemplate[] => {
  const lowercaseQuery = query.toLowerCase();
  return ALL_CAD_TEMPLATES.filter(
    template =>
      template.name.toLowerCase().includes(lowercaseQuery) ||
      template.description.toLowerCase().includes(lowercaseQuery) ||
      template.category.toLowerCase().includes(lowercaseQuery)
  );
};

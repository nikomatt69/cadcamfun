// Template Manager for CAD Analysis Templates
// src/lib/ai/codeInterpreter/templates/templateManager.ts

import {
  ALL_CAD_TEMPLATES,
  TEMPLATE_CATEGORIES,
  CADTemplate,
  TemplateCategory,
  getTemplatesByCategory,
  getTemplateById,
  getTemplatesByDifficulty,
  searchTemplates
} from "./index";
import { useElementsStore } from "../../../../store/elementsStore";

export class TemplateManager {
  private customTemplates: CADTemplate[] = [];
  private initialized = false;

  constructor() {
    // Don't load from localStorage during SSR
    if (typeof window !== 'undefined') {
      this.loadCustomTemplates();
    }
  }

  // Ensure templates are loaded (lazy loading)
  private ensureInitialized(): void {
    if (!this.initialized && typeof window !== 'undefined') {
      this.loadCustomTemplates();
      this.initialized = true;
    }
  }

  // Get current elements from store
  private getCurrentElements(): any[] {
    const elementsStore = useElementsStore.getState();
    return elementsStore.elements || [];
  }

  // Get all templates (built-in + custom)
  getAllTemplates(): CADTemplate[] {
    this.ensureInitialized();
    return [...ALL_CAD_TEMPLATES, ...this.customTemplates];
  }

  // Get templates by category
  getTemplatesByCategory(categoryId: string): CADTemplate[] {
    const allTemplates = this.getAllTemplates();
    return allTemplates.filter(template => template.category === categoryId);
  }

  // Get template by ID
  getTemplate(templateId: string): CADTemplate | undefined {
    const allTemplates = this.getAllTemplates();
    return allTemplates.find(template => template.id === templateId);
  }

  // Search templates
  searchTemplates(query: string): CADTemplate[] {
    const allTemplates = this.getAllTemplates();
    const lowercaseQuery = query.toLowerCase();
    return allTemplates.filter(
      template =>
        template.name.toLowerCase().includes(lowercaseQuery) ||
        template.description.toLowerCase().includes(lowercaseQuery) ||
        template.category.toLowerCase().includes(lowercaseQuery)
    );
  }

  // Get templates by difficulty
  getTemplatesByDifficulty(difficulty: "basic" | "intermediate" | "advanced"): CADTemplate[] {
    const allTemplates = this.getAllTemplates();
    return allTemplates.filter(template => template.difficulty === difficulty);
  }

  // Add custom template
  addCustomTemplate(template: CADTemplate): void {
    // Ensure unique ID
    const existingIds = this.getAllTemplates().map(t => t.id);
    if (existingIds.includes(template.id)) {
      throw new Error(`Template with ID '${template.id}' already exists`);
    }

    this.customTemplates.push(template);
    this.saveCustomTemplates();
  }

  // Remove custom template
  removeCustomTemplate(templateId: string): boolean {
    const index = this.customTemplates.findIndex(t => t.id === templateId);
    if (index !== -1) {
      this.customTemplates.splice(index, 1);
      this.saveCustomTemplates();
      return true;
    }
    return false;
  }

  // Update custom template
  updateCustomTemplate(templateId: string, updatedTemplate: Partial<CADTemplate>): boolean {
    const index = this.customTemplates.findIndex(t => t.id === templateId);
    if (index !== -1) {
      this.customTemplates[index] = { ...this.customTemplates[index], ...updatedTemplate };
      this.saveCustomTemplates();
      return true;
    }
    return false;
  }

  // Get all categories
  getCategories(): TemplateCategory[] {
    return TEMPLATE_CATEGORIES;
  }

  // Get template statistics
  getStatistics() {
    const allTemplates = this.getAllTemplates();

    const stats = {
      total: allTemplates.length,
      builtIn: ALL_CAD_TEMPLATES.length,
      custom: this.customTemplates.length,
      byCategory: {} as Record<string, number>,
      byDifficulty: {
        basic: 0,
        intermediate: 0,
        advanced: 0
      }
    };

    // Count by category
    TEMPLATE_CATEGORIES.forEach(category => {
      stats.byCategory[category.id] = this.getTemplatesByCategory(category.id).length;
    });

    // Count by difficulty
    allTemplates.forEach(template => {
      stats.byDifficulty[template.difficulty]++;
    });

    return stats;
  }

  // Generate template for CodeInterpreterTab (now uses current elements from store)
  generateTemplateForCodeTab(): { id: string; name: string; description: string; code: string }[] {
    const allTemplates = this.getAllTemplates();
    const currentElements = this.getCurrentElements();

    return allTemplates.map(template => ({
      id: template.id,
      name: template.name,
      description: template.description,
      code: this.injectCADElements(template.code, currentElements)
    }));
  }

  // Inject CAD elements into template code
  private injectCADElements(templateCode: string, cadElements: any[]): string {
    // Replace the placeholder with actual CAD elements from the store
    const elementsJson = JSON.stringify(cadElements, null, 2);
    return templateCode
      .replace(
        /elements\s*=\s*cadElements\s*if\s*'cadElements'\s*in\s*globals\(\)\s*else\s*\[\]/g,
        `elements = ${elementsJson}`
      )
      .replace(/cadElements\s*if\s*'cadElements'\s*in\s*globals\(\)\s*else\s*\[\]/g, elementsJson);
  }

  // Save custom templates to localStorage
  private saveCustomTemplates(): void {
    try {
      // Only save if we're in the browser
      if (typeof window !== 'undefined' && localStorage) {
        localStorage.setItem("cad_custom_templates", JSON.stringify(this.customTemplates));
      }
    } catch (error) {
      console.warn("Failed to save custom templates:", error);
    }
  }

  // Load custom templates from localStorage
  private loadCustomTemplates(): void {
    try {
      // Additional safety check
      if (typeof window === 'undefined' || !localStorage) {
        this.customTemplates = [];
        return;
      }
      
      const saved = localStorage.getItem("cad_custom_templates");
      if (saved) {
        this.customTemplates = JSON.parse(saved);
      }
      this.initialized = true;
    } catch (error) {
      console.warn("Failed to load custom templates:", error);
      this.customTemplates = [];
    }
  }

  // Export templates to JSON
  exportTemplates(): string {
    return JSON.stringify(
      {
        builtIn: ALL_CAD_TEMPLATES,
        custom: this.customTemplates,
        categories: TEMPLATE_CATEGORIES
      },
      null,
      2
    );
  }

  // Import templates from JSON
  importTemplates(jsonData: string): { imported: number; errors: string[] } {
    const errors: string[] = [];
    let imported = 0;

    try {
      const data = JSON.parse(jsonData);

      if (data.custom && Array.isArray(data.custom)) {
        data.custom.forEach((template: any) => {
          try {
            // Validate template structure
            if (!template.id || !template.name || !template.code) {
              errors.push(`Invalid template structure: ${template.name || "unnamed"}`);
              return;
            }

            // Check for duplicates
            const existingIds = this.getAllTemplates().map(t => t.id);
            if (existingIds.includes(template.id)) {
              errors.push(`Template ID '${template.id}' already exists`);
              return;
            }

            this.customTemplates.push(template);
            imported++;
          } catch (error) {
            errors.push(`Failed to import template: ${error}`);
          }
        });
      }

      if (imported > 0) {
        this.saveCustomTemplates();
      }
    } catch (error) {
      errors.push(`Failed to parse JSON: ${error}`);
    }

    return { imported, errors };
  }

  // Create template from code
  createTemplateFromCode(
    id: string,
    name: string,
    description: string,
    category: string,
    difficulty: "basic" | "intermediate" | "advanced",
    code: string,
    estimatedTime?: string,
    requiredPackages?: string[],
    outputTypes?: string[]
  ): CADTemplate {
    return {
      id,
      name,
      description,
      category,
      difficulty,
      estimatedTime: estimatedTime || "2-3 minutes",
      requiredPackages: requiredPackages || ["matplotlib", "numpy"],
      outputTypes: outputTypes || ["chart"],
      code
    };
  }

  // Get recommended templates based on current CAD elements from store
  getRecommendedTemplates(): CADTemplate[] {
    const cadElements = this.getCurrentElements();

    if (!cadElements || cadElements.length === 0) {
      // Return basic templates for empty projects
      return this.getTemplatesByDifficulty("basic").slice(0, 5);
    }

    const recommendations: CADTemplate[] = [];
    const allTemplates = this.getAllTemplates();

    // Recommend based on number of elements
    if (cadElements.length === 1) {
      recommendations.push(
        ...allTemplates.filter(t => t.id.includes("basic") || t.category === "geometric").slice(0, 3)
      );
    } else if (cadElements.length > 5) {
      recommendations.push(
        ...allTemplates.filter(t => t.category === "manufacturing" || t.category === "optimization").slice(0, 3)
      );
    }

    // Recommend based on materials
    const materialSet = new Set(cadElements.map(el => el.material).filter(Boolean));
    const materials = Array.from(materialSet);
    if (materials.length > 1) {
      recommendations.push(
        ...allTemplates.filter(t => t.id.includes("material") || t.category === "material").slice(0, 2)
      );
    }

    // Recommend based on element types
    const elementTypeSet = new Set(cadElements.map(el => el.type).filter(Boolean));
    const elementTypes = Array.from(elementTypeSet);
    if (elementTypes.includes("sphere") || elementTypes.includes("cone")) {
      recommendations.push(
        ...allTemplates.filter(t => t.category === "structural" || t.difficulty === "advanced").slice(0, 2)
      );
    }

    // Remove duplicates and limit to 8 recommendations
    const uniqueRecommendations = recommendations.filter(
      (template, index, array) => array.findIndex(t => t.id === template.id) === index
    );

    return uniqueRecommendations.slice(0, 8);
  }

  // Get current elements info for display
  getCurrentElementsInfo(): { count: number; types: string[]; materials: string[] } {
    const elements = this.getCurrentElements();
    const typeSet = new Set(elements.map(el => el.type).filter(Boolean));
    const materialSet = new Set(elements.map(el => el.material).filter(Boolean));

    return {
      count: elements.length,
      types: Array.from(typeSet),
      materials: Array.from(materialSet)
    };
  }
}

// Singleton instance
export const templateManager = new TemplateManager();

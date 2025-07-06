import { ApplicationContext } from "../../UnifiedAIOrchestrator";

export class PageContextProvider {
  /**
   * Get current page context based on browser state
   */
  async getCurrentPageContext(): Promise<ApplicationContext["page"]> {
    try {
      if (typeof window === "undefined") {
        return this.getDefaultPageContext();
      }

      const route = window.location.pathname;
      const section = this.determineSectionFromRoute(route);
      const mode = this.determineModeFromRoute(route);
      const activePanel = this.getActivePanelFromDOM();

      return {
        route,
        section,
        mode,
        activePanel
      };
    } catch (error) {
      console.error("Error getting page context:", error);
      return this.getDefaultPageContext();
    }
  }

  /**
   * Get current viewport state
   */
  async getViewportState(): Promise<ApplicationContext["viewport"]> {
    try {
      if (typeof window === "undefined") {
        return this.getDefaultViewportState();
      }

      // Try to get viewport state from canvas or 3D viewer
      const canvasElement = document.querySelector("canvas");
      const camera = this.getCameraStateFromCanvas(canvasElement);

      return {
        camera: camera || { x: 0, y: 0, z: 100, zoom: 1 },
        view: this.getCurrentView(),
        grid: this.isGridVisible(),
        units: this.getCurrentUnits()
      };
    } catch (error) {
      console.error("Error getting viewport state:", error);
      return this.getDefaultViewportState();
    }
  }

  /**
   * Update context from browser changes
   */
  updateFromBrowser(): void {
    // This method can be called when browser state changes
    // Implementation depends on your application's state management
    console.log("Updating context from browser changes");
  }

  /**
   * Determine section from current route
   */
  private determineSectionFromRoute(route: string): ApplicationContext["page"]["section"] {
    if (route.includes("/cad") || route.includes("/design")) return "cad";
    if (route.includes("/cam") || route.includes("/manufacturing")) return "cam";
    if (route.includes("/gcode")) return "gcode";
    if (route.includes("/materials")) return "materials";
    if (route.includes("/tools")) return "tools";
    if (route.includes("/projects")) return "projects";
    if (route.includes("/settings")) return "settings";

    // Default based on path segments
    const segments = route.split("/").filter(s => s);
    if (segments.length > 0) {
      const firstSegment = segments[0];
      switch (firstSegment) {
        case "cad":
        case "design":
          return "cad";
        case "cam":
        case "manufacturing":
          return "cam";
        case "gcode":
          return "gcode";
        case "materials":
          return "materials";
        case "tools":
          return "tools";
        case "projects":
          return "projects";
        case "settings":
          return "settings";
        default:
          return "cad";
      }
    }

    return "cad";
  }

  /**
   * Determine mode from current route and context
   */
  private determineModeFromRoute(route: string): ApplicationContext["page"]["mode"] {
    if (route.includes("/analysis")) return "analysis";
    if (route.includes("/manufacturing") || route.includes("/cam")) return "manufacturing";
    if (route.includes("/simulation")) return "simulation";

    // Default mode based on section
    if (route.includes("/cad") || route.includes("/design")) return "design";

    return "design";
  }

  /**
   * Get active panel from DOM inspection
   */
  private getActivePanelFromDOM(): string | undefined {
    try {
      if (typeof window === "undefined") return undefined;

      // Look for panels that are currently visible/active
      const activePanels = [
        { selector: '[data-panel="properties"]', name: "properties" },
        { selector: '[data-panel="layers"]', name: "layers" },
        { selector: '[data-panel="tools"]', name: "tools" },
        { selector: '[data-panel="ai"]', name: "ai" },
        { selector: ".sidebar-panel.active", name: "sidebar" },
        { selector: ".property-panel.visible", name: "properties" },
        { selector: ".ai-panel.open", name: "ai" }
      ];

      for (const panel of activePanels) {
        const element = document.querySelector(panel.selector);
        if (element && this.isElementVisible(element)) {
          return panel.name;
        }
      }

      return undefined;
    } catch (error) {
      console.error("Error getting active panel:", error);
      return undefined;
    }
  }

  /**
   * Get camera state from canvas element
   */
  private getCameraStateFromCanvas(canvas: Element | null): ApplicationContext["viewport"]["camera"] | null {
    try {
      if (!canvas) return null;

      // Try to get camera state from Three.js or other 3D libraries
      // This is a placeholder - you'll need to adapt to your 3D library
      const threeCamera = (window as any).THREE_CAMERA;
      if (threeCamera) {
        return {
          x: threeCamera.position.x || 0,
          y: threeCamera.position.y || 0,
          z: threeCamera.position.z || 100,
          zoom: threeCamera.zoom || 1
        };
      }

      return null;
    } catch (error) {
      console.error("Error getting camera state:", error);
      return null;
    }
  }

  /**
   * Get current view type
   */
  private getCurrentView(): ApplicationContext["viewport"]["view"] {
    try {
      if (typeof window === "undefined") return "iso";

      // Check for view indicators in the UI
      const viewButtons = document.querySelectorAll("[data-view]");
      for (const button of Array.from(viewButtons)) {
        if (button.classList.contains("active") || button.classList.contains("selected")) {
          const view = button.getAttribute("data-view");
          if (view === "front" || view === "top" || view === "side" || view === "iso" || view === "custom") {
            return view as ApplicationContext["viewport"]["view"];
          }
        }
      }

      // Check URL parameters
      const urlParams = new URLSearchParams(window.location.search);
      const viewParam = urlParams.get("view");
      if (
        viewParam === "front" ||
        viewParam === "top" ||
        viewParam === "side" ||
        viewParam === "iso" ||
        viewParam === "custom"
      ) {
        return viewParam as ApplicationContext["viewport"]["view"];
      }

      return "iso";
    } catch (error) {
      console.error("Error getting current view:", error);
      return "iso";
    }
  }

  /**
   * Check if grid is visible
   */
  private isGridVisible(): boolean {
    try {
      if (typeof window === "undefined") return true;

      // Check for grid toggle state
      const gridToggle = document.querySelector('[data-toggle="grid"]');
      if (gridToggle) {
        return gridToggle.classList.contains("active") || gridToggle.getAttribute("aria-pressed") === "true";
      }

      // Check for grid element visibility
      const gridElement = document.querySelector(".grid") || document.querySelector("[data-grid]");
      if (gridElement) {
        return this.isElementVisible(gridElement);
      }

      return true; // Default to visible
    } catch (error) {
      console.error("Error checking grid visibility:", error);
      return true;
    }
  }

  /**
   * Get current units
   */
  private getCurrentUnits(): ApplicationContext["viewport"]["units"] {
    try {
      if (typeof window === "undefined") return "mm";

      // Check for units selector
      const unitsSelector = document.querySelector("[data-units]") as HTMLSelectElement;
      if (unitsSelector && unitsSelector.value) {
        const units = unitsSelector.value;
        if (units === "mm" || units === "cm" || units === "in") {
          return units as ApplicationContext["viewport"]["units"];
        }
      }

      // Check for units indicator in UI
      const unitsIndicator = document.querySelector(".units-indicator");
      if (unitsIndicator) {
        const text = unitsIndicator.textContent?.toLowerCase();
        if (text?.includes("mm")) return "mm";
        if (text?.includes("cm")) return "cm";
        if (text?.includes("in") || text?.includes("inch")) return "in";
      }

      // Check localStorage
      const storedUnits = localStorage.getItem("cad_units");
      if (storedUnits === "mm" || storedUnits === "cm" || storedUnits === "in") {
        return storedUnits as ApplicationContext["viewport"]["units"];
      }

      return "mm"; // Default
    } catch (error) {
      console.error("Error getting current units:", error);
      return "mm";
    }
  }

  /**
   * Check if an element is visible
   */
  private isElementVisible(element: Element): boolean {
    const style = window.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
  }

  /**
   * Get default page context
   */
  private getDefaultPageContext(): ApplicationContext["page"] {
    return {
      route: "/",
      section: "cad",
      mode: "design",
      activePanel: undefined
    };
  }

  /**
   * Get default viewport state
   */
  private getDefaultViewportState(): ApplicationContext["viewport"] {
    return {
      camera: { x: 0, y: 0, z: 100, zoom: 1 },
      view: "iso",
      grid: true,
      units: "mm"
    };
  }
}

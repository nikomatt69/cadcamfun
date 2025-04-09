// example-entity-counter-plugin/src/main.ts

// Placeholder for the actual API structure provided by the host SDK
interface PluginAPI {
  model: {
    getEntities: (options?: { type?: string }) => Promise<Array<{ id: string; type: string }>>; // Example entity structure
  };
  ui: {
    showNotification: (message: string, options?: { type?: 'info' | 'success' | 'warning' | 'error' }) => void;
  };
  // Placeholder for potential future API additions
  commands?: {
    registerCommand: (id: string, handler: (args?: any) => void) => void;
  };
  // ... other namespaces like file, network etc.
}

let pluginApiInstance: PluginAPI | null = null;
let rootElement: HTMLElement | null = null;

console.log("[EntityCounter] main.ts loaded");

/**
 * Called when the plugin is activated.
 * Store the API instance for later use.
 */
export function activate(api: PluginAPI): void {
  console.log("[EntityCounter] Plugin Activated");
  pluginApiInstance = api;

  // Optionally register commands here if defined in manifest
  // if (api.commands) {
  //   api.commands.registerCommand('entitycounter.count', handleCountEntities);
  // }
}

/**
 * Called when the plugin is deactivated.
 * Clean up resources.
 */
export function deactivate(): void {
  console.log("[EntityCounter] Plugin Deactivated");
  // Clean up UI if needed
  if (rootElement) {
    rootElement.innerHTML = ''; // Clear content
  }
  pluginApiInstance = null;
  rootElement = null;
}

/**
 * Handles the logic for counting entities and updating the UI.
 */
async function handleCountEntities(): Promise<void> {
  if (!pluginApiInstance || !rootElement) {
    console.error("[EntityCounter] Cannot count entities: Plugin not ready or UI not rendered.");
    return;
  }

  const countResultElement = rootElement.querySelector('#entity-count-result');
  const countButton = rootElement.querySelector('button');

  if (countButton) countButton.disabled = true;
  if (countResultElement) countResultElement.textContent = 'Counting...';

  try {
    const entities = await pluginApiInstance.model.getEntities();
    const count = entities.length;

    console.log(`[EntityCounter] Found ${count} entities.`);

    if (countResultElement) {
      countResultElement.textContent = `Found ${count} entities in the model.`;
    }

    pluginApiInstance.ui.showNotification(`Counted ${count} entities.`, { type: 'success' });

  } catch (error) {
    console.error("[EntityCounter] Error counting entities:", error);
    if (countResultElement) {
      countResultElement.textContent = `Error: ${error instanceof Error ? error.message : String(error)}`;
    }
    pluginApiInstance.ui.showNotification("Failed to count entities.", { type: 'error' });
  } finally {
    if (countButton) countButton.disabled = false;
  }
}

/**
 * Called by the host (specifically IFramePluginHost) to render the plugin's UI.
 */
export function render(container: HTMLElement): void {
  if (!container) {
    console.error("[EntityCounter] Cannot render: No container provided.");
    return;
  }
  rootElement = container; // Store the container reference

  console.log("[EntityCounter] Rendering UI into container:", container);

  // Basic HTML UI (In a real plugin, you might use React, Vue, etc. compiled)
  container.innerHTML = `
    <div style="padding: 15px; font-family: sans-serif; display: flex; flex-direction: column; gap: 10px; height: 100%; box-sizing: border-box;">
      <h3>Entity Counter</h3>
      <button id="count-button" style="padding: 8px 12px; cursor: pointer; background-color: #007bff; color: white; border: none; border-radius: 4px;">
        Count Entities
      </button>
      <p id="entity-count-result" style="margin-top: 10px; font-size: 14px; color: #333;">
        Click the button to count entities.
      </p>
    </div>
  `;

  // Add event listener to the button
  const button = container.querySelector('#count-button');
  if (button) {
    button.addEventListener('click', handleCountEntities);
  } else {
    console.error("[EntityCounter] Could not find count button after render.");
  }
}
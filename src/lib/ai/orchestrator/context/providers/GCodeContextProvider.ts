import { ApplicationContext } from "../../UnifiedAIOrchestrator";

export class GCodeContextProvider {
  private lastGCodeSnapshot: string = "";
  private lastUpdateTime: number = 0;

  /**
   * Get current G-code context from editor or file system
   */
  async getGCodeContext(): Promise<ApplicationContext["gcode"]> {
    try {
      const gcode = await this.getCurrentGCode();
      if (!gcode) {
        return undefined;
      }

      const fileName = this.getCurrentFileName();
      const lines = this.countLines(gcode);
      const { errors, warnings } = this.analyzeGCode(gcode);
      const selectedLines = this.getSelectedLines();

      return {
        content: gcode,
        fileName,
        lines,
        errors,
        warnings,
        selectedLines
      };
    } catch (error) {
      console.error("Error getting G-code context:", error);
      return undefined;
    }
  }

  /**
   * Check for G-code updates
   */
  checkForUpdates(): void {
    try {
      const currentTime = Date.now();

      // Throttle checks
      if (currentTime - this.lastUpdateTime < 2000) {
        return;
      }

      this.getCurrentGCode().then(currentGCode => {
        if (currentGCode && currentGCode !== this.lastGCodeSnapshot) {
          this.lastGCodeSnapshot = currentGCode;
          this.lastUpdateTime = currentTime;

          // Emit update event
          this.notifyGCodeUpdate(currentGCode);
        }
      });
    } catch (error) {
      console.error("Error checking G-code updates:", error);
    }
  }

  /**
   * Get current G-code from various sources
   */
  private async getCurrentGCode(): Promise<string | null> {
    try {
      if (typeof window === "undefined") {
        return null;
      }

      // Check for G-code editor content
      const editor = this.findGCodeEditor();
      if (editor) {
        return this.getEditorContent(editor);
      }

      // Check global state
      const globalGCode = (window as any).GCODE_CONTENT;
      if (typeof globalGCode === "string") {
        return globalGCode;
      }

      // Check textarea or contenteditable elements
      const textAreas = document.querySelectorAll('textarea[data-type="gcode"], .gcode-editor, [data-gcode-editor]');
      for (const textArea of Array.from(textAreas)) {
        const content = (textArea as HTMLTextAreaElement).value || textArea.textContent;
        if (content && this.looksLikeGCode(content)) {
          return content;
        }
      }

      // Check for file input or uploaded content
      const fileContent = this.getUploadedGCodeContent();
      if (fileContent) {
        return fileContent;
      }

      return null;
    } catch (error) {
      console.error("Error getting current G-code:", error);
      return null;
    }
  }

  /**
   * Find G-code editor in DOM
   */
  private findGCodeEditor(): HTMLElement | null {
    try {
      // Look for common G-code editor selectors
      const selectors = [
        ".gcode-editor",
        "[data-gcode-editor]",
        '.code-editor[data-language="gcode"]',
        '.monaco-editor[data-language="gcode"]',
        "#gcode-editor"
      ];

      for (const selector of selectors) {
        const editor = document.querySelector(selector) as HTMLElement;
        if (editor) {
          return editor;
        }
      }

      return null;
    } catch (error) {
      console.error("Error finding G-code editor:", error);
      return null;
    }
  }

  /**
   * Get content from editor element
   */
  private getEditorContent(editor: HTMLElement): string | null {
    try {
      // Handle Monaco Editor
      if (editor.classList.contains("monaco-editor")) {
        const monaco = (window as any).monaco;
        if (monaco) {
          const model = monaco.editor.getModels().find((m: any) => m.getLanguageId() === "gcode");
          if (model) {
            return model.getValue();
          }
        }
      }

      // Handle CodeMirror
      const codeMirror = (editor as any).CodeMirror;
      if (codeMirror) {
        return codeMirror.getValue();
      }

      // Handle Ace Editor
      const aceEditor = (editor as any).env?.editor;
      if (aceEditor) {
        return aceEditor.getValue();
      }

      // Handle regular textarea or contenteditable
      if (editor.tagName === "TEXTAREA") {
        return (editor as HTMLTextAreaElement).value;
      }

      if (editor.contentEditable === "true") {
        return editor.textContent || editor.innerText;
      }

      // Look for child textarea or content element
      const textArea = editor.querySelector("textarea");
      if (textArea) {
        return textArea.value;
      }

      const contentElement = editor.querySelector(".editor-content, .code-content");
      if (contentElement) {
        return contentElement.textContent || (contentElement as HTMLElement).innerText;
      }

      return null;
    } catch (error) {
      console.error("Error getting editor content:", error);
      return null;
    }
  }

  /**
   * Get current file name
   */
  private getCurrentFileName(): string {
    try {
      if (typeof window === "undefined") {
        return "untitled.gcode";
      }

      // Check for file name in UI
      const fileNameElements = document.querySelectorAll(".filename, .file-name, [data-filename], .current-file");

      for (const element of Array.from(fileNameElements)) {
        const text = element.textContent || element.getAttribute("data-filename");
        if (text && text.trim()) {
          return text.trim();
        }
      }

      // Check page title
      if (document.title.includes(".gcode") || document.title.includes(".nc")) {
        return document.title.split(" ")[0];
      }

      // Check URL
      const pathParts = window.location.pathname.split("/");
      const lastPart = pathParts[pathParts.length - 1];
      if (lastPart && (lastPart.includes(".gcode") || lastPart.includes(".nc"))) {
        return lastPart;
      }

      return "untitled.gcode";
    } catch (error) {
      console.error("Error getting file name:", error);
      return "untitled.gcode";
    }
  }

  /**
   * Count lines in G-code
   */
  private countLines(gcode: string): number {
    try {
      return gcode.split("\n").length;
    } catch (error) {
      console.error("Error counting lines:", error);
      return 0;
    }
  }

  /**
   * Analyze G-code for errors and warnings
   */
  private analyzeGCode(gcode: string): { errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const lines = gcode.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const lineNumber = i + 1;

        if (!line || line.startsWith(";") || line.startsWith("(")) {
          continue; // Skip empty lines and comments
        }

        // Check for basic G-code syntax errors
        if (line.match(/[^A-Z0-9\s\.\-\+]/i)) {
          errors.push(`Line ${lineNumber}: Invalid characters in G-code`);
        }

        // Check for missing feed rate on motion commands
        if (line.match(/G[01]/i) && !line.match(/F\d/) && !this.hasPreviousFeedRate(lines, i)) {
          warnings.push(`Line ${lineNumber}: No feed rate specified for motion command`);
        }

        // Check for very high speeds
        const feedMatch = line.match(/F(\d+)/i);
        if (feedMatch && parseInt(feedMatch[1]) > 10000) {
          warnings.push(`Line ${lineNumber}: Very high feed rate (${feedMatch[1]})`);
        }

        // Check for coordinates without G-code command
        if (line.match(/[XYZ]\d/i) && !line.match(/G\d/i)) {
          warnings.push(`Line ${lineNumber}: Coordinates without motion command`);
        }

        // Check for potential typos in common commands
        if (line.match(/G0[^0-3]/i)) {
          errors.push(`Line ${lineNumber}: Invalid G0x command`);
        }
      }
    } catch (error) {
      console.error("Error analyzing G-code:", error);
      errors.push("Error during G-code analysis");
    }

    return { errors, warnings };
  }

  /**
   * Check if previous lines contain feed rate
   */
  private hasPreviousFeedRate(lines: string[], currentIndex: number): boolean {
    for (let i = currentIndex - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (line.match(/F\d/i)) {
        return true;
      }
      // Stop at program start or major mode change
      if (line.match(/M[03]|G90|G91/i)) {
        break;
      }
    }
    return false;
  }

  /**
   * Get selected lines in editor
   */
  private getSelectedLines(): { start: number; end: number } | undefined {
    try {
      if (typeof window === "undefined") {
        return undefined;
      }

      const editor = this.findGCodeEditor();
      if (!editor) {
        return undefined;
      }

      // Handle Monaco Editor
      if (editor.classList.contains("monaco-editor")) {
        const monaco = (window as any).monaco;
        if (monaco) {
          const activeEditor = monaco.editor.getActiveEditor?.();
          if (activeEditor) {
            const selection = activeEditor.getSelection();
            if (selection && !selection.isEmpty()) {
              return {
                start: selection.startLineNumber,
                end: selection.endLineNumber
              };
            }
          }
        }
      }

      // Handle other editors or text selection
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        if (range.startContainer.nodeType === Node.TEXT_NODE) {
          // Calculate line numbers from text content
          const container = range.startContainer.parentElement;
          if (container && editor.contains(container)) {
            const text = editor.textContent || "";
            const beforeStart = text.substring(0, range.startOffset);
            const beforeEnd = text.substring(0, range.endOffset);

            return {
              start: beforeStart.split("\n").length,
              end: beforeEnd.split("\n").length
            };
          }
        }
      }

      return undefined;
    } catch (error) {
      console.error("Error getting selected lines:", error);
      return undefined;
    }
  }

  /**
   * Check if content looks like G-code
   */
  private looksLikeGCode(content: string): boolean {
    try {
      const lines = content.split("\n").slice(0, 20); // Check first 20 lines
      let gcodeLineCount = 0;

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.match(/^[GM]\d+/i) || trimmed.match(/^[XYZ][\d\.\-]/i)) {
          gcodeLineCount++;
        }
      }

      return gcodeLineCount > 0 && gcodeLineCount / lines.length > 0.1;
    } catch (error) {
      console.error("Error checking G-code format:", error);
      return false;
    }
  }

  /**
   * Get uploaded G-code content from file inputs
   */
  private getUploadedGCodeContent(): string | null {
    try {
      // Check for recent file uploads
      const fileInputs = document.querySelectorAll(
        'input[type="file"][accept*=".gcode"], input[type="file"][accept*=".nc"]'
      );

      for (const input of Array.from(fileInputs)) {
        const files = (input as HTMLInputElement).files;
        if (files && files.length > 0) {
          // This would require FileReader API and async handling
          // For now, we'll return null and handle this in the actual implementation
          return null;
        }
      }

      // Check for drag-and-drop area content
      const dropZones = document.querySelectorAll("[data-file-drop], .file-drop-zone");
      for (const zone of Array.from(dropZones)) {
        const content = zone.getAttribute("data-file-content");
        if (content && this.looksLikeGCode(content)) {
          return content;
        }
      }

      return null;
    } catch (error) {
      console.error("Error getting uploaded G-code content:", error);
      return null;
    }
  }

  /**
   * Notify about G-code updates
   */
  private notifyGCodeUpdate(gcode: string): void {
    try {
      if (typeof window !== "undefined") {
        const event = new CustomEvent("gcode:updated", {
          detail: {
            content: gcode,
            timestamp: Date.now()
          }
        });
        window.dispatchEvent(event);
      }
    } catch (error) {
      console.error("Error notifying G-code update:", error);
    }
  }
}

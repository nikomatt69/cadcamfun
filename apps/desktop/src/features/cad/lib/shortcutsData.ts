import type { ShortcutCategory } from "../components/ShortcutsDialog.tsx"

/** Every keyboard shortcut the editor documents, grouped as the shortcuts dialog shows them. */
export const ALL_SHORTCUTS: ShortcutCategory[] = [
    {
      title: "Navigation",
      shortcuts: [
        { keys: ["Left Click + Drag"], description: "Rotate camera (3D mode)" },
        { keys: ["Middle Click + Drag"], description: "Pan view" },
        { keys: ["Right Click + Drag"], description: "Orbit around selection" },
        { keys: ["Scroll"], description: "Zoom in/out" },
        { keys: ["+", "="], description: "Zoom in" },
        { keys: ["-", "_"], description: "Zoom out" },
        { keys: ["F"], description: "Zoom to fit/focus on selection" },
        { keys: ["Ctrl + 1"], description: "Switch to 3D view" },
        { keys: ["Ctrl + 2"], description: "Switch to top view (2D)" }
      ]
    },
    {
      title: "Selection & Editing",
      shortcuts: [
        { keys: ["Click"], description: "Select object" },
        { keys: ["Shift + Click"], description: "Add to selection" },
        { keys: ["Ctrl + Click"], description: "Remove from selection" },
        { keys: ["Escape"], description: "Deselect all / Cancel current operation" },
        { keys: ["Delete", "Backspace"], description: "Delete selected objects" },
        { keys: ["G"], description: "Move (Translate) mode" },
        { keys: ["R"], description: "Rotate mode" },
        { keys: ["S"], description: "Scale mode" },
        { keys: ["X"], description: "Constrain to X axis" },
        { keys: ["Y"], description: "Constrain to Y axis" },
        { keys: ["Z"], description: "Constrain to Z axis" }
      ]
    },
    {
      title: "Tools & Creation",
      shortcuts: [
        { keys: ["L"], description: "Line tool" },
        { keys: ["C"], description: "Circle tool" },
        { keys: ["R"], description: "Rectangle tool" },
        { keys: ["P"], description: "Polygon tool" },
        { keys: ["B"], description: "Box/Cube tool" },
        { keys: ["O"], description: "Sphere tool" },
        { keys: ["Y"], description: "Cylinder tool" },
        { keys: ["T"], description: "Text tool" },
        { keys: ["D"], description: "Dimension tool" },
        { keys: ["M"], description: "Measurement tool" }
      ]
    },
    {
      title: "View Controls",
      shortcuts: [
        { keys: ["Ctrl + G"], description: "Toggle grid visibility" },
        { keys: ["Ctrl + A"], description: "Toggle axes visibility" },
        { keys: ["F11", "Alt + F"], description: "Toggle fullscreen" },
        { keys: ["H"], description: "Hide selected objects" },
        { keys: ["Alt + H"], description: "Show all objects" },
        { keys: ["W"], description: "Toggle wireframe mode" },
        { keys: ["Alt + Z"], description: "Toggle X-ray mode" }
      ]
    },
    {
      title: "Snapping & Precision",
      shortcuts: [
        { keys: ["Ctrl + X"], description: "Toggle snap mode" },
        { keys: ["Alt + G"], description: "Toggle grid snap" },
        { keys: ["Alt + P"], description: "Toggle point snap" },
        { keys: ["Alt + M"], description: "Toggle midpoint snap" },
        { keys: ["Alt + I"], description: "Toggle intersection snap" },
        { keys: ["Alt + C"], description: "Toggle center snap" }
      ]
    },
    {
      title: "History & File Operations",
      shortcuts: [
        { keys: ["Ctrl + Z"], description: "Undo" },
        { keys: ["Ctrl + Y", "Ctrl + Shift + Z"], description: "Redo" },
        { keys: ["Ctrl + S"], description: "Save" },
        { keys: ["Ctrl + O"], description: "Open" },
        { keys: ["Ctrl + N"], description: "New" },
        { keys: ["Ctrl + E"], description: "Export" },
        { keys: ["Ctrl + I"], description: "Import" }
      ]
    },
    {
      title: "Layers & Organization",
      shortcuts: [
        { keys: ["Ctrl + L"], description: "Toggle layers panel" },
        { keys: ["Ctrl + Shift + N"], description: "New layer" },
        { keys: ["Ctrl + G"], description: "Group selected objects" },
        { keys: ["Ctrl + Shift + G"], description: "Ungroup" },
        { keys: ["Alt + L"], description: "Lock selected objects" },
        { keys: ["Alt + Shift + L"], description: "Unlock all objects" }
      ]
    },
    {
      title: "Help & UI",
      shortcuts: [
        { keys: ["?", "Shift + /"], description: "Show keyboard shortcuts (this dialog)" },
        { keys: ["F1"], description: "Help" },
        { keys: ["Ctrl + ,"], description: "Preferences" },
        { keys: ["Tab"], description: "Toggle sidebar" },
        { keys: ["Ctrl + B"], description: "Toggle properties panel" },
        { keys: ["Ctrl + Space"], description: "Command palette" },
        { keys: ["Ctrl + F"], description: "Search" }
      ]
    }
]

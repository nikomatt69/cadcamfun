# UI strings outside `t()` — inventory

Generated 2026-10-29 by `bun apps/desktop/test/helpers/i18n-literals.ts` (a heuristic over `apps/desktop/src`, not a parser: it can miss English that
sits in data tables under other field names, e.g. `name:` of a preset, and it can flag the odd identifier). Each hit is an English string a reader sees
that does not go through `t()`. `bun apps/desktop/test/helpers/i18n-literals.ts --detail` lists every line; `apps/desktop/test/i18n-literals.test.ts`
fails when a file gets more of them than `i18n-literals.baseline.json` records.

Translated in all 11 languages and checked in the running app in Italian (`apps/desktop/test/explorer-i18n.test.ts`): the **Explorer tab** of the CAD and
the CAM sidebar, the CAD **Layers** and **Tools** tabs and the snap settings, and the whole **CAM generator panel** (operation, material, cutting, tool,
origin, printer, lathe, AI, evidence, G-code viewer). About 260 more literals were switched to keys that already existed.

Order of work for the rest (most seen first): the CAD floating toolbar, property panel and canvas messages, then the pages (toolpaths, library, projects,
settings, costs, auth, plugins), then the data tables (`cad/lib/propertyFields.ts` is 40 % of what is left).

## By area

| Literals | Area |
| ---: | --- |
| 692 | `features/cad` |
| 90 | `features/library` |
| 86 | `features/toolpaths` |
| 69 | `features/ai` |
| 45 | `features/manuals` |
| 30 | `features/costs` |
| 27 | `features/settings` |
| 22 | `features/projects` |
| 9 | `features/auth` |
| 7 | `features/cam` |
| 5 | `features/plugins` |
| 3 | `shared/components` |
| 3 | `library-review.tsx` |
| 2 | `features/organizations` |
| 2 | `features/mcp` |
| 2 | `shared/ui` |
| 1 | `viewport` |
| 1 | `features/analytics` |

## By file (most first)

| Literals | File (under `apps/desktop/src/`) |
| ---: | --- |
| 432 | `features/cad/lib/propertyFields.ts` |
| 66 | `features/cad/lib/customElements/templates.ts` |
| 54 | `features/library/screens/ResourceDetailScreens.tsx` |
| 49 | `features/toolpaths/screens/ToolpathDetailScreen.tsx` |
| 45 | `features/manuals/lib/catalogue.ts` |
| 38 | `features/cad/components/ParametricPanel.tsx` |
| 32 | `features/cad/lib/predefinedLibraries.ts` |
| 30 | `features/ai/lib/tools.ts` |
| 25 | `features/ai/lib/suggestions.ts` |
| 22 | `features/toolpaths/screens/ToolpathsScreen.tsx` |
| 21 | `features/projects/screens/project-detail.tsx` |
| 20 | `features/cad/components/CADCanvas.tsx` |
| 19 | `features/library/screens/ResourcesScreen.tsx` |
| 16 | `features/cad/components/ExactModelPanel.tsx` |
| 15 | `features/cad/components/EnhancedToolbar.tsx` |
| 14 | `features/costs/store/costsStore.ts` |
| 12 | `features/settings/components/ai-settings-panel.tsx` |
| 11 | `features/cad/components/ImportExportDialog.tsx` |
| 10 | `features/cad/screens/CadPage.tsx` |
| 9 | `features/costs/components/ToolWearCostForm.tsx` |
| 9 | `features/ai/components/ToolRow.tsx` |
| 7 | `features/settings/screens/settings.tsx` |
| 7 | `features/cad/components/property-inputs/ColorListInput.tsx` |
| 6 | `features/settings/components/profile-settings.tsx` |
| 6 | `features/costs/components/MaterialCostForm.tsx` |
| 6 | `features/cad/components/property-inputs/PointListInput.tsx` |
| 6 | `features/cad/components/ElementsListPanel.tsx` |
| 6 | `features/toolpaths/components/ToolpathLibraryModal.tsx` |
| 5 | `features/auth/screens/signup.tsx` |
| 5 | `features/plugins/screens/plugins.tsx` |
| 5 | `features/library/components/ResourceGeneratorDialog.tsx` |
| 5 | `features/cad/components/SelectionControls.tsx` |
| 5 | `features/cad/components/PropertyPanel.tsx` |
| 5 | `features/cad/store/customElementsStore.ts` |
| 5 | `features/cam/components/CamRibbon.data.ts` |
| 5 | `features/toolpaths/components/ToolpathFormModal.tsx` |
| 4 | `features/library/lib/resource-generation.ts` |
| 4 | `features/cad/components/LibraryBrowser.tsx` |
| 4 | `features/cad/components/ElementInfo.tsx` |
| 4 | `features/toolpaths/components/ToolpathProgramDetails.tsx` |
| 3 | `features/auth/screens/signin.tsx` |
| 3 | `features/library/components/MachinePreview3D.tsx` |
| 3 | `features/cad/components/property-inputs/ElementListInput.tsx` |
| 3 | `library-review.tsx` |
| 2 | `features/organizations/screens/organizations.tsx` |
| 2 | `features/library/components/MaterialPreview3D.tsx` |
| 2 | `features/mcp/screens/mcp-servers.tsx` |
| 2 | `features/cad/components/custom-elements/ParameterControls.tsx` |
| 2 | `features/cad/store/localComponentsLibraryStore.ts` |
| 2 | `features/ai/components/CommandPalette.tsx` |
| 2 | `shared/ui/slider.tsx` |
| 2 | `shared/components/reference-navigation.tsx` |
| 1 | `viewport/editor2d/editor2d.tsx` |
| 1 | `features/settings/components/keybindings-settings.tsx` |
| 1 | `features/settings/components/passkey-settings.tsx` |
| 1 | `features/costs/lib/costsFormat.ts` |
| 1 | `features/auth/screens/two-factor.tsx` |
| 1 | `features/projects/screens/projects.tsx` |
| 1 | `features/library/components/ToolPreview3D.tsx` |
| 1 | `features/library/hooks/useUnifiedLibrary.ts` |
| 1 | `features/library/store/localLibraryStores.ts` |
| 1 | `features/cad/components/WorkpieceSetup.tsx` |
| 1 | `features/cad/components/FloatingToolbar.tsx` |
| 1 | `features/cad/components/SaveCADAsProjectModal.tsx` |
| 1 | `features/cam/components/CamRibbon.tsx` |
| 1 | `features/cam/lib/program-sheet.ts` |
| 1 | `features/ai/components/ProviderSettings.tsx` |
| 1 | `features/ai/lib/stream.ts` |
| 1 | `features/ai/lib/vision.ts` |
| 1 | `features/analytics/screens/analytics.tsx` |
| 1 | `shared/components/schema-form.ts` |

Total: total 1096 in 71 files

import React, { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Grid, List, Search, Star, Trash2, Edit2, Download, Upload, Filter } from "react-feather";
import { useAIComponentStore } from "@/src/store/aiComponentStore";
import { Element3dPreview } from "./Element3dPreview";

interface ComponentLibraryProps {
  onSelectComponent?: (componentId: string) => void;
  onAddToCanvas?: (elements: any[]) => void;
  className?: string;
}

export const ComponentLibrary: React.FC<ComponentLibraryProps> = ({
  onSelectComponent,
  onAddToCanvas,
  className = ""
}) => {
  const {
    components,
    favoriteComponents,
    filterTags,
    addFilterTag,
    removeFilterTag,
    clearFilterTags,
    toggleFavorite,
    deleteComponent,
    exportComponents,
    importComponents
  } = useAIComponentStore();

  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [showFilters, setShowFilters] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Filtra componenti in base a ricerca e tag
  const filteredComponents = components.filter(comp => {
    // Filtra per termine di ricerca
    const matchesSearch =
      !searchTerm ||
      comp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      comp.description.toLowerCase().includes(searchTerm.toLowerCase());

    // Filtra per tag
    const matchesTags = filterTags.length === 0 || filterTags.some(tag => comp.tags.includes(tag));

    return matchesSearch && matchesTags;
  });

  // Gestisce l'aggiunta di un componente all'area di lavoro
  const handleAddToCanvas = (componentId: string) => {
    const component = components.find(comp => comp.id === componentId);
    if (!component || !onAddToCanvas) return;

    onAddToCanvas(component.elements);
  };

  // Gestisce l'esportazione di un componente
  const handleExport = async (componentId: string) => {
    try {
      const blob = await exportComponents([componentId]);
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `component_${componentId}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to export component:", error);
    }
  };

  // Gestisce l'importazione di componenti
  const handleImport = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;

    try {
      const file = e.target.files[0];
      await importComponents(file);
    } catch (error) {
      console.error("Failed to import components:", error);
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  // Ottieni tutti i tag unici da tutti i componenti
  const allTags = Array.from(new Set(components.flatMap(comp => comp.tags)));

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-xl shadow-lg ${className}`}>
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold">Component Library</h2>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setViewMode("grid")}
            className={`p-1.5 rounded ${
              viewMode === "grid"
                ? "bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-200"
                : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
            }`}
          >
            <Grid size={18} />
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`p-1.5 rounded ${
              viewMode === "list"
                ? "bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-200"
                : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
            }`}
          >
            <List size={18} />
          </button>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`p-1.5 rounded ${
              showFilters || filterTags.length > 0
                ? "bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-200"
                : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
            }`}
          >
            <Filter size={18} />
            {filterTags.length > 0 && (
              <span className="absolute top-0 right-0 bg-blue-600 text-white rounded-full text-xs w-4 h-4 flex items-center justify-center">
                {filterTags.length}
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center relative">
          <Search size={18} className="absolute left-3 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search components..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200"
          />
        </div>

        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="mt-3 overflow-hidden"
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Filter by Tags</h3>
                {filterTags.length > 0 && (
                  <button
                    onClick={clearFilterTags}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Clear filters
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1">
                {allTags.map(tag => (
                  <button
                    key={tag}
                    onClick={() => {
                      if (filterTags.includes(tag)) {
                        removeFilterTag(tag);
                      } else {
                        addFilterTag(tag);
                      }
                    }}
                    className={`px-2 py-1 text-xs rounded-full ${
                      filterTags.includes(tag)
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                        : "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Components ({filteredComponents.length})
          </h3>
          <div className="flex items-center space-x-2">
            <button
              onClick={handleImport}
              className="flex items-center text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >
              <Upload size={12} className="mr-1" />
              Import
            </button>
            <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".json" className="hidden" />
          </div>
        </div>

        {viewMode === "grid" ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {filteredComponents.map(component => (
              <div
                key={component.id}
                className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800"
              >
                <div className="h-32 bg-gray-50 dark:bg-gray-700 flex items-center justify-center relative">
                  {component.elements.length > 0 && (
                    <Element3dPreview element={component.elements[0]} size={{ width: 120, height: 120 }} />
                  )}
                  <button
                    onClick={() => toggleFavorite(component.id)}
                    className="absolute top-2 right-2 p-1 bg-white dark:bg-gray-800 rounded-full shadow"
                  >
                    <Star
                      size={16}
                      className={
                        favoriteComponents.includes(component.id) ? "text-yellow-500 fill-yellow-500" : "text-gray-400"
                      }
                    />
                  </button>
                </div>
                <div className="p-3">
                  <h4 className="font-medium text-sm truncate">{component.name}</h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 truncate">
                    {component.elements.length} elements
                  </p>
                  <div className="flex space-x-1 mt-2">
                    <button
                      onClick={() => handleAddToCanvas(component.id)}
                      className="flex-1 px-2 py-1 bg-blue-600 text-white text-xs rounded"
                    >
                      Add
                    </button>
                    <button
                      onClick={() => handleExport(component.id)}
                      className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400"
                    >
                      <Download size={16} />
                    </button>
                    <button
                      onClick={() => deleteComponent(component.id)}
                      className="p-1 text-gray-500 hover:text-red-600 dark:text-gray-400"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredComponents.map(component => (
              <div
                key={component.id}
                className="flex items-center p-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <div className="flex-shrink-0 w-12 h-12 bg-gray-50 dark:bg-gray-700 rounded flex items-center justify-center mr-3">
                  {component.elements.length > 0 && (
                    <Element3dPreview element={component.elements[0]} size={{ width: 48, height: 48 }} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-sm truncate">{component.name}</h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {component.elements.length} elements •{new Date(component.timestamp).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => toggleFavorite(component.id)}
                    className="p-1 text-gray-500 hover:text-yellow-500 dark:text-gray-400"
                  >
                    <Star
                      size={16}
                      className={favoriteComponents.includes(component.id) ? "text-yellow-500 fill-yellow-500" : ""}
                    />
                  </button>
                  <button
                    onClick={() => handleAddToCanvas(component.id)}
                    className="px-2 py-1 bg-blue-600 text-white text-xs rounded"
                  >
                    Add
                  </button>
                  <button
                    onClick={() => handleExport(component.id)}
                    className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400"
                  >
                    <Download size={16} />
                  </button>
                  <button
                    onClick={() => deleteComponent(component.id)}
                    className="p-1 text-gray-500 hover:text-red-600 dark:text-gray-400"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {filteredComponents.length === 0 && (
          <div className="text-center py-8">
            <p className="text-gray-500 dark:text-gray-400">No components found.</p>
          </div>
        )}
      </div>
    </div>
  );
};

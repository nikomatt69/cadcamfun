// WebSearchDropdown.tsx - Dropdown per risultati di ricerca web
import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, ExternalLink, X, Loader, ChevronDown, ChevronUp, Globe, Clock, Tag, Calendar } from "react-feather";
import { WebSearchResult } from "@/src/lib/ai/websearch/websearchService";

interface WebSearchDropdownProps {
  isOpen: boolean;
  onToggle: () => void;
  searchResults: WebSearchResult[] | null;
  isSearching: boolean;
  searchQuery: string;
  suggestions?: string[];
  relatedQueries?: string[];
  onSuggestionClick?: (suggestion: string) => void;
  onResultClick?: (result: WebSearchResult) => void;
  searchTime?: number;
  totalResults?: number;
}

export const WebSearchDropdown: React.FC<WebSearchDropdownProps> = ({
  isOpen,
  onToggle,
  searchResults,
  isSearching,
  searchQuery,
  suggestions = [],
  relatedQueries = [],
  onSuggestionClick,
  onResultClick,
  searchTime,
  totalResults
}) => {
  const [expandedResults, setExpandedResults] = useState<Set<string>>(new Set());

  const toggleResultExpansion = (resultUrl: string) => {
    const newExpanded = new Set(expandedResults);
    if (newExpanded.has(resultUrl)) {
      newExpanded.delete(resultUrl);
    } else {
      newExpanded.add(resultUrl);
    }
    setExpandedResults(newExpanded);
  };

  const formatSearchTime = (time?: number) => {
    if (!time) return "";
    return `${(time / 1000).toFixed(2)}s`;
  };

  return (
    <AnimatePresence>
      {(isOpen || isSearching || (searchResults && searchResults.length > 0)) && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2 }}
          className="relative bg-white/70 dark:bg-gray-800/70 backdrop-blur-xl border border-gray-200/50 dark:border-gray-700/50 rounded-2xl shadow-lg overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-indigo-50/80 to-blue-50/80 dark:from-gray-700/80 dark:to-gray-800/80 backdrop-blur-sm border-b border-gray-200/50 dark:border-gray-700/50">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-xl flex items-center justify-center shadow-md">
                <Search size={16} className="text-white" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">Web Search Results</span>
                {searchQuery && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">&quot;{searchQuery}&quot;</span>
                )}
              </div>
            </div>
            <motion.button
              onClick={onToggle}
              className="p-2 hover:bg-white/50 dark:hover:bg-gray-600/50 rounded-xl transition-all duration-300 backdrop-blur-sm"
              title={isOpen ? "Collapse" : "Expand"}
              whileHover={{ scale: 1.05, rotate: isOpen ? 180 : 0 }}
              whileTap={{ scale: 0.95 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
            >
              {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </motion.button>
          </div>

          {/* Content */}
          {isOpen && (
            <motion.div 
              className="max-h-96 overflow-y-auto"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              {/* Search Status */}
              {isSearching ? (
                <div className="flex items-center justify-center p-8 space-x-3">
                  <div className="relative">
                    <Loader size={20} className="animate-spin text-indigo-600" />
                    <div className="absolute inset-0 animate-ping">
                      <Loader size={20} className="text-indigo-300 opacity-30" />
                    </div>
                  </div>
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Searching the web...</span>
                </div>
              ) : searchResults && searchResults.length > 0 ? (
                <>
                  {/* Search Metadata */}
                  <div className="px-4 py-3 bg-gradient-to-r from-gray-50/70 to-gray-100/70 dark:from-gray-800/70 dark:to-gray-900/70 backdrop-blur-sm border-b border-gray-200/50 dark:border-gray-700/50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="flex items-center space-x-2">
                          <div className="w-2 h-2 bg-gradient-to-r from-green-400 to-green-500 rounded-full"></div>
                          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                            Found {totalResults || searchResults.length} results
                          </span>
                        </div>
                        {searchTime && (
                          <div className="flex items-center space-x-1 px-2 py-1 bg-blue-100/70 dark:bg-blue-900/70 rounded-full backdrop-blur-sm">
                            <Clock size={12} className="text-blue-600 dark:text-blue-400" />
                            <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
                              {formatSearchTime(searchTime)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Search Results */}
                  <div className="divide-y divide-gray-200 dark:divide-gray-700">
                    {searchResults.map((result, index) => (
                      <motion.div
                        key={result.url}
                        initial={{ opacity: 0, y: 20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ delay: index * 0.1, type: "spring", stiffness: 200, damping: 15 }}
                        className="p-4 hover:bg-white/60 dark:hover:bg-gray-750/60 transition-all duration-300 cursor-pointer rounded-xl mx-2 backdrop-blur-sm border border-transparent hover:border-gray-200/50 dark:hover:border-gray-600/50 hover:shadow-md"
                        onClick={() => onResultClick?.(result)}
                        whileHover={{ scale: 1.02, y: -2 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <div className="space-y-1">
                          {/* Title and URL */}
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <h4 className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 truncate mb-1 leading-relaxed">
                                {result.title}
                              </h4>
                              <div className="flex items-center space-x-2 px-2 py-1 bg-gray-100/70 dark:bg-gray-800/70 rounded-md backdrop-blur-sm">
                                <Globe size={12} className="text-gray-500 dark:text-gray-400" />
                                <span className="text-xs text-gray-600 dark:text-gray-300 font-medium truncate">
                                  {new URL(result.url).hostname}
                                </span>
                              </div>
                            </div>
                            <a
                              href={result.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="ml-3 p-2 hover:bg-blue-100/50 dark:hover:bg-blue-900/50 rounded-lg transition-all duration-300 backdrop-blur-sm group"
                              onClick={e => e.stopPropagation()}
                            >
                              <ExternalLink size={16} className="text-gray-500 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" />
                            </a>
                          </div>

                          {/* Snippet -> Cited Text */}
                          <div className="mt-2 p-3 bg-gray-50/70 dark:bg-gray-800/70 rounded-lg backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50">
                            <p
                              className={`text-sm text-gray-700 dark:text-gray-300 leading-relaxed ${expandedResults.has(result.url) ? "" : "line-clamp-3"}`}
                            >
                              {result.cited_text || "No cited text available."}
                            </p>
                          </div>

                          {/* Metadata */}
                          <div className="flex items-center justify-between mt-2">
                            <div className="flex items-center space-x-2">
                              {result.page_age && (
                                <div className="flex items-center space-x-1 px-2 py-1 bg-amber-100/70 dark:bg-amber-900/70 rounded-full backdrop-blur-sm">
                                  <Calendar size={12} className="text-amber-600 dark:text-amber-400" />
                                  <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
                                    {result.page_age}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Expand/Collapse button for long cited_text */}
                          {result.cited_text && result.cited_text.length > 150 && (
                            <div className="mt-2 flex justify-center">
                              <button
                                onClick={e => {
                                  e.stopPropagation();
                                  toggleResultExpansion(result.url);
                                }}
                                className="px-3 py-1.5 text-xs font-medium bg-blue-100/70 dark:bg-blue-900/70 text-blue-700 dark:text-blue-300 hover:bg-blue-200/70 dark:hover:bg-blue-800/70 rounded-lg transition-all duration-300 backdrop-blur-sm hover:scale-105"
                              >
                                {expandedResults.has(result.url) ? "Show less" : "Show more"}
                              </button>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </div>

                  {/* Suggestions */}
                  {suggestions.length > 0 && (
                    <motion.div 
                      className="p-4 bg-blue-50/70 dark:bg-gray-900/70 backdrop-blur-sm border-t border-gray-200/50 dark:border-gray-700/50"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: 0.2 }}
                    >
                      <motion.div 
                        className="flex items-center space-x-2 mb-3"
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.3, delay: 0.3 }}
                      >
                        <div className="w-1.5 h-1.5 bg-gradient-to-r from-blue-400 to-blue-500 rounded-full"></div>
                        <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Suggestions</p>
                      </motion.div>
                      <motion.div 
                        className="flex flex-wrap gap-2"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.3, delay: 0.4 }}
                      >
                        {suggestions.map((suggestion, index) => (
                          <motion.button
                            key={index}
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: index * 0.05, type: "spring", stiffness: 300, damping: 20 }}
                            onClick={() => onSuggestionClick?.(suggestion)}
                            className="px-3 py-1.5 text-xs font-medium bg-white/70 dark:bg-gray-800/70 border border-gray-300/50 dark:border-gray-600/50 rounded-lg hover:bg-gray-100/70 dark:hover:bg-gray-700/70 transition-all duration-300 backdrop-blur-sm hover:shadow-md"
                            whileHover={{ scale: 1.05, y: -1 }}
                            whileTap={{ scale: 0.95 }}
                          >
                            {suggestion}
                          </motion.button>
                        ))}
                      </motion.div>
                    </motion.div>
                  )}

                  {/* Related Queries */}
                  {relatedQueries.length > 0 && (
                    <motion.div 
                      className="p-4 bg-gray-50/70 dark:bg-gray-900/70 backdrop-blur-sm border-t border-gray-200/50 dark:border-gray-700/50"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: 0.3 }}
                    >
                      <motion.div 
                        className="flex items-center space-x-2 mb-3"
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.3, delay: 0.4 }}
                      >
                        <div className="w-1.5 h-1.5 bg-gradient-to-r from-indigo-400 to-indigo-500 rounded-full"></div>
                        <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Related searches</p>
                      </motion.div>
                      <motion.div 
                        className="flex flex-wrap gap-2"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.3, delay: 0.5 }}
                      >
                        {relatedQueries.map((query, index) => (
                          <motion.button
                            key={index}
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: index * 0.05, type: "spring", stiffness: 300, damping: 20 }}
                            onClick={() => onSuggestionClick?.(query)}
                            className="px-3 py-1.5 text-xs font-medium bg-indigo-100/70 dark:bg-indigo-900/70 text-indigo-700 dark:text-indigo-300 rounded-lg hover:bg-indigo-200/70 dark:hover:bg-indigo-800/70 transition-all duration-300 flex items-center space-x-1.5 backdrop-blur-sm hover:shadow-md"
                            whileHover={{ scale: 1.05, y: -1 }}
                            whileTap={{ scale: 0.95 }}
                          >
                            <Search size={12} />
                            <span>{query}</span>
                          </motion.button>
                        ))}
                      </motion.div>
                    </motion.div>
                  )}
                </>
              ) : searchQuery ? (
                <div className="p-8 text-center">
                  <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-red-100 to-orange-100 dark:from-red-900/30 dark:to-orange-900/30 rounded-2xl flex items-center justify-center backdrop-blur-sm shadow-lg">
                    <Search size={32} className="text-red-500 dark:text-red-400" />
                  </div>
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    No results found for &quot;{searchQuery}&quot;
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100/70 dark:bg-gray-800/70 px-3 py-2 rounded-lg backdrop-blur-sm inline-block">
                    Try different keywords or check your spelling
                  </p>
                </div>
              ) : (
                <div className="p-8 text-center">
                  <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-indigo-100 to-blue-100 dark:from-indigo-900/30 dark:to-blue-900/30 rounded-2xl flex items-center justify-center backdrop-blur-sm shadow-lg">
                    <Search size={32} className="text-indigo-500 dark:text-indigo-400" />
                  </div>
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    Use the web search tool to find CAD/CAM information
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100/70 dark:bg-gray-800/70 px-3 py-2 rounded-lg backdrop-blur-sm inline-block">
                    Search for tutorials, best practices, materials, and more
                  </p>
                </div>
              )}
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

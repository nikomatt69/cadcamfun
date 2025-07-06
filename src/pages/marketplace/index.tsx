import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/src/components/layout/Layout';
import { ItemCard } from '@/src/components/marketplace/ItemCard';
import { SellModal } from '@/src/components/marketplace/SellModal';
import { useMarketplaceStore } from '@/src/store/marketplaceStore';
import { MarketplaceItemType, LicenseType } from '@/src/types/marketplace';
import {
  Search,
  Filter,
  Grid,
  List,
  Plus,
  TrendingUp,
  Users,
  Award
} from 'react-feather';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/src/lib/utils';
import toast from 'react-hot-toast';
import { useSession } from '@/src/lib/auth-client';
const CATEGORIES = [
  { id: 'components', name: 'CAD Components', icon: '🔧' },
  { id: 'drawings', name: 'Technical Drawings', icon: '📐' },
  { id: 'assemblies', name: 'Assemblies', icon: '⚙️' },
  { id: 'gcode', name: 'G-Code Programs', icon: '🤖' },
  { id: 'toolpaths', name: 'Toolpaths', icon: '🛠️' },
];

const ITEM_TYPES: { value: MarketplaceItemType; label: string }[] = [
  { value: 'COMPONENT', label: 'Components' },
  { value: 'DRAWING', label: 'Drawings' },
  { value: 'PROJECT', label: 'Projects' },
  { value: 'GCODE', label: 'G-Code' },
  { value: 'TOOLPATH', label: 'Toolpaths' },
  { value: 'ASSEMBLY', label: 'Assemblies' },
];

const LICENSE_TYPES: { value: LicenseType; label: string }[] = [
  { value: 'PERSONAL', label: 'Personal Use' },
  { value: 'COMMERCIAL', label: 'Commercial Use' },
  { value: 'EXTENDED', label: 'Extended License' },
  { value: 'ROYALTY_FREE', label: 'Royalty Free' },
];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'price_low', label: 'Price: Low to High' },
  { value: 'price_high', label: 'Price: High to Low' },
  { value: 'rating', label: 'Highest Rated' },
  { value: 'downloads', label: 'Most Downloaded' },
];

export default function MarketplacePage() {

  const router = useRouter();
  const { data: session } = useSession();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showFilters, setShowFilters] = useState(false);
  const [showSellModal, setShowSellModal] = useState(false);

  const {
    items,
    isLoading,
    error,
    filters,
    pagination,
    searchQuery,
    fetchItems,
    setFilters,
    setSearchQuery,
    clearFilters
  } = useMarketplaceStore();

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setFilters({ search: searchQuery, page: 1 });
    fetchItems();
  };

  const handleFilterChange = (key: string, value: any) => {
    setFilters({ [key]: value, page: 1 });
    fetchItems();
  };

  const handlePageChange = (page: number) => {
    setFilters({ page });
    fetchItems();
  };



  return (
    <Layout>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        {/* Hero Section */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
            <div className="text-center">
              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-5xl font-bold mb-4"
              >
                CAD/CAM Marketplace
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="text-xl mb-8 opacity-90"
              >
                Discover and purchase high-quality CAD components, drawings, and G-code programs
              </motion.p>

              {/* Stats */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="flex justify-center items-center space-x-8 mb-8 text-sm"
              >
                <div className="flex items-center space-x-2">
                  <TrendingUp size={16} />
                  <span>{pagination.total}+ Items</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Users size={16} />
                  <span>Professional Designers</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Award size={16} />
                  <span>Quality Assured</span>
                </div>
              </motion.div>

              {/* Search Bar */}
              <motion.form
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                onSubmit={handleSearch}
                className="max-w-2xl mx-auto"
              >
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search for components, drawings, toolpaths..."
                    className="w-full px-6 py-4 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-300"
                  />
                  <button
                    type="submit"
                    className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
                  >
                    <Search size={24} />
                  </button>
                </div>
              </motion.form>

              {/* Sell Button */}
              {session && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.4 }}
                  onClick={() => setShowSellModal(true)}
                  className="mt-6 inline-flex items-center space-x-2 bg-white text-blue-600 px-6 py-3 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
                >
                  <Plus size={20} />
                  <span>Sell Your Work</span>
                </motion.button>
              )}
            </div>
          </div>
        </div>

        {/* Categories */}
        <div className="bg-white dark:bg-gray-800 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex justify-center space-x-8 overflow-x-auto">
              <button
                onClick={() => handleFilterChange('category', undefined)}
                className={cn(
                  "flex flex-col items-center p-4 rounded-lg transition-colors whitespace-nowrap",
                  !filters.category
                    ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                    : "hover:bg-gray-50 dark:hover:bg-gray-700"
                )}
              >
                <span className="text-2xl mb-2">🌟</span>
                <span className="text-sm font-medium">All Categories</span>
              </button>
              {CATEGORIES.map((category) => (
                <button
                  key={category.id}
                  onClick={() => handleFilterChange('category', category.id)}
                  className={cn(
                    "flex flex-col items-center p-4 rounded-lg transition-colors whitespace-nowrap",
                    filters.category === category.id
                      ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                      : "hover:bg-gray-50 dark:hover:bg-gray-700"
                  )}
                >
                  <span className="text-2xl mb-2">{category.icon}</span>
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {category.name}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Filters & View Controls */}
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-8">
            <div className="flex items-center space-x-4 mb-4 lg:mb-0">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center space-x-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <Filter size={18} />
                <span>Filters</span>
                {(filters.type || filters.licenseType || filters.priceMin || filters.priceMax) && (
                  <span className="ml-2 bg-blue-600 text-white text-xs px-2 py-1 rounded-full">
                    {[filters.type, filters.licenseType, filters.priceMin, filters.priceMax].filter(Boolean).length}
                  </span>
                )}
              </button>

              <button
                onClick={clearFilters}
                className="px-4 py-2 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
              >
                Clear All
              </button>

              {/* Sort */}
              <select
                value={filters.sortBy || 'newest'}
                onChange={(e) => handleFilterChange('sortBy', e.target.value)}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {pagination.total} items found
              </span>

              <div className="flex items-center space-x-2 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                <button
                  onClick={() => setViewMode('grid')}
                  className={cn(
                    'p-2 rounded transition-colors',
                    viewMode === 'grid'
                      ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                  )}
                >
                  <Grid size={18} />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={cn(
                    'p-2 rounded transition-colors',
                    viewMode === 'list'
                      ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                  )}
                >
                  <List size={18} />
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-col lg:flex-row gap-8">
            {/* Sidebar Filters */}
            <AnimatePresence>
              {showFilters && (
                <motion.div
                  initial={{ opacity: 0, x: -300 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -300 }}
                  className="lg:w-64 space-y-6"
                >
                  <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                    <h3 className="font-semibold mb-4 text-gray-900 dark:text-white">Item Type</h3>
                    <div className="space-y-2">
                      {ITEM_TYPES.map((type) => (
                        <label key={type.value} className="flex items-center">
                          <input
                            type="checkbox"
                            checked={filters.type === type.value}
                            onChange={(e) =>
                              handleFilterChange('type', e.target.checked ? type.value : undefined)
                            }
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">{type.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                    <h3 className="font-semibold mb-4 text-gray-900 dark:text-white">License Type</h3>
                    <div className="space-y-2">
                      {LICENSE_TYPES.map((license) => (
                        <label key={license.value} className="flex items-center">
                          <input
                            type="checkbox"
                            checked={filters.licenseType === license.value}
                            onChange={(e) =>
                              handleFilterChange('licenseType', e.target.checked ? license.value : undefined)
                            }
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">{license.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                    <h3 className="font-semibold mb-4 text-gray-900 dark:text-white">Price Range</h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Min Price ($)
                        </label>
                        <input
                          type="number"
                          value={filters.priceMin || ''}
                          onChange={(e) =>
                            handleFilterChange('priceMin', e.target.value ? parseFloat(e.target.value) : undefined)
                          }
                          className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Max Price ($)
                        </label>
                        <input
                          type="number"
                          value={filters.priceMax || ''}
                          onChange={(e) =>
                            handleFilterChange('priceMax', e.target.value ? parseFloat(e.target.value) : undefined)
                          }
                          className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                    <h3 className="font-semibold mb-4 text-gray-900 dark:text-white">Featured</h3>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={filters.featured === true}
                        onChange={(e) =>
                          handleFilterChange('featured', e.target.checked ? true : undefined)
                        }
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">Featured items only</span>
                    </label>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Items Grid/List */}
            <div className="flex-1">
              {isLoading ? (
                <div className={cn(
                  viewMode === 'grid'
                    ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'
                    : 'space-y-4'
                )}>
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className="bg-white dark:bg-gray-800 rounded-lg shadow animate-pulse">
                      <div className="h-48 bg-gray-200 dark:bg-gray-700 rounded-t-lg"></div>
                      <div className="p-4 space-y-3">
                        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
                        <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
                        <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/4"></div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : error ? (
                <div className="text-center py-12">
                  <p className="text-red-600 dark:text-red-400">{error}</p>
                </div>
              ) : items.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-500 dark:text-gray-400">No items found. Try adjusting your filters.</p>
                </div>
              ) : (
                <div
                  className={cn(
                    viewMode === 'grid'
                      ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'
                      : 'space-y-4'
                  )}
                >
                  {items.map((item) => (
                    <ItemCard
                      key={item.id}
                      item={item}
                      className={cn(
                        viewMode === 'list' && 'flex-row'
                      )}
                    />
                  ))}
                </div>
              )}

              {/* Pagination */}
              {pagination.pages > 1 && (
                <div className="mt-8 flex justify-center">
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handlePageChange(pagination.page - 1)}
                      disabled={pagination.page === 1}
                      className="px-4 py-2 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>

                    {Array.from({ length: Math.min(5, pagination.pages) }, (_, i) => {
                      const page = i + Math.max(1, pagination.page - 2);
                      return page <= pagination.pages ? (
                        <button
                          key={page}
                          onClick={() => handlePageChange(page)}
                          className={cn(
                            'px-4 py-2 rounded-lg',
                            page === pagination.page
                              ? 'bg-blue-600 text-white'
                              : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                          )}
                        >
                          {page}
                        </button>
                      ) : null;
                    })}

                    <button
                      onClick={() => handlePageChange(pagination.page + 1)}
                      disabled={pagination.page === pagination.pages}
                      className="px-4 py-2 rounded-lg bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sell Modal */}
        <SellModal
          isOpen={showSellModal}
          onClose={() => {
            setShowSellModal(false);
            fetchItems(); // Refresh items when modal closes
          }}
        />
      </div>
    </Layout>
  );
} 
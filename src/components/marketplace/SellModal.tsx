import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Upload,
  DollarSign,
  Star,
  Search,
  Package,
  Tool,
  FileText,
  Grid,
  Eye,
  Check,
  Image as ImageIcon
} from 'react-feather';
import { useSession } from '@/src/lib/auth-client';
import toast from 'react-hot-toast';
import { cn } from '@/src/lib/utils';

interface SellModalProps {
  isOpen: boolean;
  onClose: () => void;
  originalItem?: {
    id: string;
    type: string;
    title: string;
    description?: string;
  };
}

interface UserItem {
  id: string;
  title: string;
  description?: string;
  type: 'COMPONENT' | 'TOOLPATH' | 'DRAWING' | 'PROJECT' | 'GCODE';
  createdAt: string;
  thumbnailUrl?: string;
  fileUrl?: string;
  fileSize?: number;
  tags?: string[];
}

export const SellModal: React.FC<SellModalProps> = ({ isOpen, onClose, originalItem }) => {
  const { data: session } = useSession();

  const [step, setStep] = useState<'select' | 'details'>('select');
  const [selectedItem, setSelectedItem] = useState<UserItem | null>(null);
  const [userItems, setUserItems] = useState<UserItem[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');

  const [formData, setFormData] = useState({
    title: originalItem?.title || '',
    description: originalItem?.description || '',
    shortDescription: '',
    price: '',
    licenseType: 'PERSONAL',
    category: '',
    tags: [] as string[],
    previewImages: [] as string[]
  });

  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen && session) {
      fetchUserItems();
    }
  }, [isOpen, session]);

  useEffect(() => {
    if (selectedItem) {
      setFormData(prev => ({
        ...prev,
        title: selectedItem.title,
        description: selectedItem.description || '',
        category: getItemCategory(selectedItem.type),
        tags: selectedItem.tags || []
      }));
    }
  }, [selectedItem]);

  const fetchUserItems = async () => {
    try {
      setIsLoadingItems(true);
      // Fetch user's components, toolpaths, projects, etc.
      const [components, toolpaths, drawings, projects] = await Promise.allSettled([
        fetch('/api/components').then(res => res.ok ? res.json() : []),
        fetch('/api/toolpaths').then(res => res.ok ? res.json() : []),
        fetch('/api/drawings').then(res => res.ok ? res.json() : []),
        fetch('/api/projects').then(res => res.ok ? res.json() : [])
      ]);

      const allItems: UserItem[] = [
        ...(components.status === 'fulfilled' ? components.value.map((item: any) => ({
          ...item,
          type: 'COMPONENT' as const
        })) : []),
        ...(toolpaths.status === 'fulfilled' ? toolpaths.value.map((item: any) => ({
          ...item,
          type: 'TOOLPATH' as const
        })) : []),
        ...(drawings.status === 'fulfilled' ? drawings.value.map((item: any) => ({
          ...item,
          type: 'DRAWING' as const
        })) : []),
        ...(projects.status === 'fulfilled' ? projects.value.map((item: any) => ({
          ...item,
          type: 'PROJECT' as const
        })) : [])
      ];

      setUserItems(allItems);
    } catch (error) {
      console.error('Error fetching user items:', error);
      toast.error('Failed to load your items');
    } finally {
      setIsLoadingItems(false);
    }
  };

  const getItemCategory = (type: string): string => {
    switch (type) {
      case 'COMPONENT': return 'components';
      case 'TOOLPATH': return 'toolpaths';
      case 'DRAWING': return 'drawings';
      case 'PROJECT': return 'projects';
      case 'GCODE': return 'gcode';
      default: return 'general';
    }
  };

  const getItemIcon = (type: string) => {
    switch (type) {
      case 'COMPONENT': return <Package size={20} />;
      case 'TOOLPATH': return <Tool size={20} />;
      case 'DRAWING': return <FileText size={20} />;
      case 'PROJECT': return <Grid size={20} />;
      default: return <Package size={20} />;
    }
  };

  const filteredItems = userItems.filter(item => {
    const matchesSearch = item.title?.toLowerCase()?.includes(searchQuery.toLowerCase()) ||
      item.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = selectedType === 'all' || item.type === selectedType;
    return matchesSearch && matchesType;
  });

  const handleItemSelect = (item: UserItem) => {
    setSelectedItem(item);
    setStep('details');
  };

  const handleBackToSelect = () => {
    setStep('select');
    setSelectedItem(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;

    setIsLoading(true);

    try {
      const response = await fetch('/api/marketplace/items', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: formData.title,
          description: formData.description,
          shortDescription: formData.shortDescription,
          type: selectedItem.type,
          price: parseFloat(formData.price),
          licenseType: formData.licenseType,
          tags: formData.tags,
          category: formData.category,
          originalItemId: selectedItem.id,
          originalItemType: selectedItem.type,
          previewImages: formData.previewImages.length > 0 ? formData.previewImages : (selectedItem.thumbnailUrl ? [selectedItem.thumbnailUrl] : [])
        }),
      });

      if (!response.ok) throw new Error('Failed to list item');

      toast.success('Item listed successfully! It will be reviewed before going live.');
      onClose();
      setStep('select');
      setSelectedItem(null);
      setFormData({
        title: '',
        description: '',
        shortDescription: '',
        price: '',
        licenseType: 'PERSONAL',
        category: '',
        tags: [],
        previewImages: []
      });
    } catch (error) {
      toast.error('Failed to list item');
    } finally {
      setIsLoading(false);
    }
  };

  const addTag = (tag: string) => {
    if (tag && !formData.tags.includes(tag)) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, tag]
      }));
    }
  };

  const removeTag = (tagToRemove: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(tag => tag !== tagToRemove)
    }));
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden relative"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                    {step === 'select' ? 'Select Item to Sell' : 'List Item for Sale'}
                  </h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    {step === 'select'
                      ? 'Choose from your created components, toolpaths, and projects'
                      : 'Set pricing and details for your item'
                    }
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto max-h-[calc(90vh-200px)]">
              {step === 'select' ? (
                <div className="p-6">
                  {/* Search and Filter */}
                  <div className="flex flex-col sm:flex-row gap-4 mb-6">
                    <div className="relative flex-1">
                      <Search size={18} className="absolute left-3 top-3 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Search your items..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <select
                      value={selectedType}
                      onChange={(e) => setSelectedType(e.target.value)}
                      className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="all">All Types</option>
                      <option value="COMPONENT">Components</option>
                      <option value="TOOLPATH">Toolpaths</option>
                      <option value="DRAWING">Drawings</option>
                      <option value="PROJECT">Projects</option>
                    </select>
                  </div>

                  {/* Items Grid */}
                  {isLoadingItems ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {[1, 2, 3, 4, 5, 6].map((i) => (
                        <div key={i} className="bg-gray-100 dark:bg-gray-700 rounded-lg p-4 animate-pulse">
                          <div className="h-32 bg-gray-200 dark:bg-gray-600 rounded mb-3"></div>
                          <div className="h-4 bg-gray-200 dark:bg-gray-600 rounded w-3/4 mb-2"></div>
                          <div className="h-3 bg-gray-200 dark:bg-gray-600 rounded w-1/2"></div>
                        </div>
                      ))}
                    </div>
                  ) : filteredItems.length === 0 ? (
                    <div className="text-center py-12">
                      <Package size={48} className="mx-auto text-gray-400 mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                        {userItems.length === 0 ? 'No Items Found' : 'No Matching Items'}
                      </h3>
                      <p className="text-gray-600 dark:text-gray-400">
                        {userItems.length === 0
                          ? 'Create some components, toolpaths, or projects first to sell them.'
                          : 'Try adjusting your search or filter criteria.'
                        }
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {filteredItems.map((item) => (
                        <motion.div
                          key={item.id}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => handleItemSelect(item)}
                          className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 cursor-pointer hover:shadow-lg transition-all border border-transparent hover:border-blue-300"
                        >
                          {/* Item Preview */}
                          <div className="h-32 bg-gray-200 dark:bg-gray-600 rounded-lg mb-3 flex items-center justify-center overflow-hidden">
                            {item.thumbnailUrl ? (
                              <img
                                src={item.thumbnailUrl}
                                alt={item.title}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="text-gray-400">
                                {getItemIcon(item.type)}
                              </div>
                            )}
                          </div>

                          {/* Item Info */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                                {item.type}
                              </span>
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                {new Date(item.createdAt).toLocaleDateString()}
                              </span>
                            </div>
                            <h4 className="font-medium text-gray-900 dark:text-white line-clamp-2">
                              {item.title}
                            </h4>
                            {item.description && (
                              <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                                {item.description}
                              </p>
                            )}
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                /* Details Form */
                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                  {/* Selected Item Preview */}
                  {selectedItem && (
                    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-medium text-gray-900 dark:text-white">Selected Item</h3>
                        <button
                          type="button"
                          onClick={handleBackToSelect}
                          className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-sm"
                        >
                          Change Selection
                        </button>
                      </div>
                      <div className="flex items-center space-x-3">
                        <div className="w-12 h-12 bg-gray-200 dark:bg-gray-600 rounded flex items-center justify-center">
                          {selectedItem.thumbnailUrl ? (
                            <img
                              src={selectedItem.thumbnailUrl}
                              alt={selectedItem.title}
                              className="w-full h-full object-cover rounded"
                            />
                          ) : (
                            getItemIcon(selectedItem.type)
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">{selectedItem.title}</p>
                          <p className="text-sm text-gray-600 dark:text-gray-400">{selectedItem.type}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Form Fields */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">Title *</label>
                      <input
                        type="text"
                        value={formData.title}
                        onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">Price (USD) *</label>
                      <div className="relative">
                        <DollarSign className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={formData.price}
                          onChange={(e) => setFormData(prev => ({ ...prev, price: e.target.value }))}
                          className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500"
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">License Type *</label>
                      <select
                        value={formData.licenseType}
                        onChange={(e) => setFormData(prev => ({ ...prev, licenseType: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500"
                        required
                      >
                        <option value="PERSONAL">Personal Use</option>
                        <option value="COMMERCIAL">Commercial Use</option>
                        <option value="EXTENDED">Extended License</option>
                        <option value="ROYALTY_FREE">Royalty Free</option>
                      </select>
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">Short Description</label>
                      <input
                        type="text"
                        value={formData.shortDescription}
                        onChange={(e) => setFormData(prev => ({ ...prev, shortDescription: e.target.value }))}
                        placeholder="Brief description for search results"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">Description *</label>
                      <textarea
                        value={formData.description}
                        onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                        rows={4}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500"
                        required
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">Tags</label>
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-2">
                          {formData.tags.map((tag, index) => (
                            <span
                              key={index}
                              className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                            >
                              {tag}
                              <button
                                type="button"
                                onClick={() => removeTag(tag)}
                                className="ml-1 text-blue-600 hover:text-blue-800"
                              >
                                <X size={12} />
                              </button>
                            </span>
                          ))}
                        </div>
                        <input
                          type="text"
                          placeholder="Add tags (press Enter)"
                          onKeyPress={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              addTag(e.currentTarget.value.trim());
                              e.currentTarget.value = '';
                            }
                          }}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between pt-4">
                    <button
                      type="button"
                      onClick={handleBackToSelect}
                      className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      Back
                    </button>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isLoading}
                        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-2"
                      >
                        {isLoading ? 'Listing...' : (
                          <>
                            <Upload size={16} />
                            List for Sale
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </form>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}; 
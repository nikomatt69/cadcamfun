import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { 
  MarketplaceItemWithSeller, 
  MarketplaceFilters, 
  MarketplaceStats,
  SellerDashboardStats,
  MarketplaceOrderWithDetails
} from '@/src/types/marketplace';

interface MarketplaceState {
  // Items
  items: MarketplaceItemWithSeller[];
  selectedItem: MarketplaceItemWithSeller | null;
  isLoading: boolean;
  error: string | null;
  
  // Filters & Search
  filters: MarketplaceFilters;
  searchQuery: string;
  
  // Pagination
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
  
  // Stats
  stats: MarketplaceStats | null;
  sellerStats: SellerDashboardStats | null;
  
  // Cart/Wishlist
  wishlist: string[];
  cart: Array<{
    itemId: string;
    quantity: number;
  }>;
  
  // Actions
  setItems: (items: MarketplaceItemWithSeller[]) => void;
  setSelectedItem: (item: MarketplaceItemWithSeller | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  
  // Filters
  setFilters: (filters: Partial<MarketplaceFilters>) => void;
  setSearchQuery: (query: string) => void;
  clearFilters: () => void;
  
  // Pagination
  setPagination: (pagination: Partial<MarketplaceState['pagination']>) => void;
  
  // API Actions
  fetchItems: (filters?: MarketplaceFilters) => Promise<void>;
  fetchItemById: (id: string) => Promise<void>;
  fetchStats: () => Promise<void>;
  fetchSellerStats: () => Promise<void>;
  
  // Wishlist
  addToWishlist: (itemId: string) => Promise<void>;
  removeFromWishlist: (itemId: string) => Promise<void>;
  
  // Cart
  addToCart: (itemId: string, quantity?: number) => void;
  removeFromCart: (itemId: string) => void;
  clearCart: () => void;
  
  // Purchase
  createCheckout: (itemId: string) => Promise<string>;
}

export const useMarketplaceStore = create<MarketplaceState>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    items: [],
    selectedItem: null,
    isLoading: false,
    error: null,
    
    filters: {
      page: 1,
      limit: 20,
      sortBy: 'newest'
    },
    searchQuery: '',
    
    pagination: {
      page: 1,
      limit: 20,
      total: 0,
      pages: 0
    },
    
    stats: null,
    sellerStats: null,
    
    wishlist: [],
    cart: [],
    
    // Basic setters
    setItems: (items) => set({ items }),
    setSelectedItem: (item) => set({ selectedItem: item }),
    setLoading: (loading) => set({ isLoading: loading }),
    setError: (error) => set({ error }),
    
    // Filters
    setFilters: (newFilters) => set((state) => ({
      filters: { ...state.filters, ...newFilters }
    })),
    
    setSearchQuery: (query) => set({ searchQuery: query }),
    
    clearFilters: () => set({
      filters: {
        page: 1,
        limit: 20,
        sortBy: 'newest'
      },
      searchQuery: ''
    }),
    
    // Pagination
    setPagination: (newPagination) => set((state) => ({
      pagination: { ...state.pagination, ...newPagination }
    })),
    
    // API Actions
    fetchItems: async (filters) => {
      set({ isLoading: true, error: null });
      
      try {
        const currentFilters = filters || get().filters;
        const queryParams = new URLSearchParams();
        
        Object.entries(currentFilters).forEach(([key, value]) => {
          if (value !== undefined && value !== null && value !== '') {
            if (Array.isArray(value)) {
              value.forEach(v => queryParams.append(key, v.toString()));
            } else {
              queryParams.append(key, value.toString());
            }
          }
        });
        
        const response = await fetch(`/api/marketplace/items?${queryParams}`);
        if (!response.ok) {
          throw new Error('Failed to fetch items');
        }
        
        const data = await response.json();
        
        set({
          items: data.items,
          pagination: data.pagination,
          isLoading: false
        });
      } catch (error: any) {
        set({
          error: error.message,
          isLoading: false
        });
      }
    },
    
    fetchItemById: async (id) => {
      set({ isLoading: true, error: null });
      
      try {
        const response = await fetch(`/api/marketplace/items/${id}`);
        if (!response.ok) {
          throw new Error('Failed to fetch item');
        }
        
        const item = await response.json();
        set({
          selectedItem: item,
          isLoading: false
        });
      } catch (error: any) {
        set({
          error: error.message,
          isLoading: false
        });
      }
    },
    
    fetchStats: async () => {
      try {
        const response = await fetch('/api/marketplace/stats');
        if (!response.ok) {
          throw new Error('Failed to fetch stats');
        }
        
        const stats = await response.json();
        set({ stats });
      } catch (error: any) {
        console.error('Failed to fetch marketplace stats:', error);
      }
    },
    
    fetchSellerStats: async () => {
      try {
        const response = await fetch('/api/marketplace/seller/stats');
        if (!response.ok) {
          throw new Error('Failed to fetch seller stats');
        }
        
        const sellerStats = await response.json();
        set({ sellerStats });
      } catch (error: any) {
        console.error('Failed to fetch seller stats:', error);
      }
    },
    
    // Wishlist
    addToWishlist: async (itemId) => {
      try {
        const response = await fetch('/api/marketplace/wishlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itemId })
        });
        
        if (!response.ok) {
          throw new Error('Failed to add to wishlist');
        }
        
        set((state) => ({
          wishlist: [...state.wishlist, itemId]
        }));
      } catch (error: any) {
        set({ error: error.message });
      }
    },
    
    removeFromWishlist: async (itemId) => {
      try {
        const response = await fetch(`/api/marketplace/wishlist/${itemId}`, {
          method: 'DELETE'
        });
        
        if (!response.ok) {
          throw new Error('Failed to remove from wishlist');
        }
        
        set((state) => ({
          wishlist: state.wishlist.filter(id => id !== itemId)
        }));
      } catch (error: any) {
        set({ error: error.message });
      }
    },
    
    // Cart
    addToCart: (itemId, quantity = 1) => {
      set((state) => {
        const existing = state.cart.find(item => item.itemId === itemId);
        if (existing) {
          return {
            cart: state.cart.map(item =>
              item.itemId === itemId
                ? { ...item, quantity: item.quantity + quantity }
                : item
            )
          };
        } else {
          return {
            cart: [...state.cart, { itemId, quantity }]
          };
        }
      });
    },
    
    removeFromCart: (itemId) => {
      set((state) => ({
        cart: state.cart.filter(item => item.itemId !== itemId)
      }));
    },
    
    clearCart: () => set({ cart: [] }),
    
    // Purchase
    createCheckout: async (itemId) => {
      try {
        const response = await fetch('/api/marketplace/checkout/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itemId })
        });
        
        if (!response.ok) {
          throw new Error('Failed to create checkout');
        }
        
        const { checkoutUrl } = await response.json();
        return checkoutUrl;
      } catch (error: any) {
        set({ error: error.message });
        throw error;
      }
    }
  }))
); 
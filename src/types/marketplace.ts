import { 
  MarketplaceItem, 
  MarketplaceSeller, 
  MarketplaceOrder, 
  MarketplaceReview,
  MarketplaceItemType,
  MarketplaceItemStatus,
  LicenseType,
  MarketplaceOrderStatus
} from '@prisma/client';

export type {
  MarketplaceItem,
  MarketplaceSeller,
  MarketplaceOrder,
  MarketplaceReview,
  MarketplaceItemType,
  MarketplaceItemStatus,
  LicenseType,
  MarketplaceOrderStatus
};

export interface MarketplaceItemWithSeller extends MarketplaceItem {
  seller: MarketplaceSeller & {
    user: {
      id: string;
      name: string | null;
      image: string | null;
    };
  };
  reviews: MarketplaceReview[];
  _count?: {
    reviews: number;
    orders: number;
  };
}

export interface MarketplaceSellerProfile extends MarketplaceSeller {
  user: {
    id: string;
    name: string | null;
    image: string | null;
  };
  items: MarketplaceItem[];
  _count: {
    items: number;
    orders: number;
  };
}

export interface MarketplaceOrderWithDetails extends MarketplaceOrder {
  item: MarketplaceItem;
  seller: MarketplaceSeller;
  buyer: {
    id: string;
    name: string | null;
    email: string | null;
  };
}

export interface CreateMarketplaceItemData {
  title: string;
  description?: string;
  shortDescription?: string;
  type: MarketplaceItemType;
  price: number;
  licenseType: LicenseType;
  tags: string[];
  category?: string;
  subcategory?: string;
  originalItemId: string;
  originalItemType: string;
  previewImages?: string[];
}

export interface MarketplaceFilters {
  search?: string;
  type?: MarketplaceItemType;
  category?: string;
  priceMin?: number;
  priceMax?: number;
  licenseType?: LicenseType;
  tags?: string[];
  sellerId?: string;
  featured?: boolean;
  sortBy?: 'newest' | 'oldest' | 'price_low' | 'price_high' | 'rating' | 'downloads';
  page?: number;
  limit?: number;
}

export interface MarketplaceStats {
  totalItems: number;
  totalSellers: number;
  totalRevenue: number;
  totalDownloads: number;
  topCategories: Array<{
    category: string;
    count: number;
  }>;
  recentSales: MarketplaceOrderWithDetails[];
}

export interface SellerDashboardStats {
  totalItems: number;
  totalSales: number;
  totalRevenue: number;
  pendingPayouts: number;
  recentOrders: MarketplaceOrderWithDetails[];
  topSellingItems: Array<{
    item: MarketplaceItem;
    salesCount: number;
    revenue: number;
  }>;
}

export interface PolarProduct {
  id: string;
  name: string;
  description?: string;
  prices: Array<{
    id: string;
    amount: number;
    currency: string;
  }>;
}

export interface PolarCheckout {
  id: string;
  url: string;
  product_id: string;
  status: 'pending' | 'completed' | 'failed';
}

export interface FileUploadProgress {
  file: File;
  progress: number;
  status: 'uploading' | 'processing' | 'completed' | 'error';
  url?: string;
  error?: string;
} 
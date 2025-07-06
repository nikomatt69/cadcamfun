import { useState, useCallback } from "react";

export interface MarketplaceItem {
  id: string;
  title: string;
  description?: string;
  shortDescription?: string;
  type: string;
  price: number;
  status: "DRAFT" | "PENDING_REVIEW" | "APPROVED" | "REJECTED" | "SUSPENDED";
  viewCount: number;
  downloadCount: number;
  rating?: number;
  reviewCount: number;
  createdAt: string;
  updatedAt: string;
  _count?: {
    orders: number;
    reviews: number;
  };
  seller?: {
    id: string;
    storeName: string;
    user: {
      id: string;
      name: string;
      image?: string;
    };
  };
}

export interface UseMarketplaceItemsReturn {
  deleteItem: (itemId: string) => Promise<boolean>;
  updateItem: (
    itemId: string,
    updates: Partial<MarketplaceItem>
  ) => Promise<MarketplaceItem | null>;
  loading: boolean;
  error: string | null;
}

export const useMarketplaceItems = (): UseMarketplaceItemsReturn => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deleteItem = useCallback(async (itemId: string): Promise<boolean> => {
    if (!itemId) {
      setError("Item ID is required");
      return false;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/marketplace/items/${itemId}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to delete item");
      }

      return true;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to delete item";
      setError(errorMessage);
      console.error("Error deleting marketplace item:", err);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateItem = useCallback(
    async (
      itemId: string,
      updates: Partial<MarketplaceItem>
    ): Promise<MarketplaceItem | null> => {
      if (!itemId) {
        setError("Item ID is required");
        return null;
      }

      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/marketplace/items/${itemId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(updates),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || "Failed to update item");
        }

        const updatedItem = await response.json();
        return updatedItem;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to update item";
        setError(errorMessage);
        console.error("Error updating marketplace item:", err);
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return {
    deleteItem,
    updateItem,
    loading,
    error,
  };
};

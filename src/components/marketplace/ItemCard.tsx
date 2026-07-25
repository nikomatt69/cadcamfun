import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import {
  Star,
  Download,
  ShoppingCart,
  Heart,
  Eye,
  DollarSign,
  Zap,
  User,
  Calendar,
  Tag,
} from "react-feather";
import { cn } from "@/src/lib/utils";
import { MarketplaceItemWithSeller } from "@/src/types/marketplace";
import { useMarketplaceStore } from "@/src/store/marketplaceStore";
import toast from "react-hot-toast";
import { useRouter } from "next/router";
import { useSession } from "@/src/lib/auth-client";

interface ItemCardProps {
  item: MarketplaceItemWithSeller;
  className?: string;
}

export const ItemCard: React.FC<ItemCardProps> = ({ item, className }) => {
  const { data: session } = useSession();
  const [isHovered, setIsHovered] = useState(false);
  const [isInWishlist, setIsInWishlist] = useState(false);
  const { addToWishlist, removeFromWishlist } = useMarketplaceStore();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const averageRating =
    item.reviews && item.reviews.length > 0
      ? item.reviews.reduce(
          (sum: number, review: any) => sum + Number(review.rating),
          0,
        ) / item.reviews.length
      : 0;

  const handleWishlistToggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      if (isInWishlist) {
        await removeFromWishlist(item.id);
        setIsInWishlist(false);
        toast.success("Removed from wishlist");
      } else {
        await addToWishlist(item.id);
        setIsInWishlist(true);
        toast.success("Added to wishlist");
      }
    } catch (error) {
      toast.error("Failed to update wishlist");
    }
  };

  const handlePurchase = async () => {
    if (!session) {
      router.push("/auth/signin");
      return;
    }

    if (item.price === 0) {
      // Free item - handle direct download
      try {
        setIsLoading(true);
        const response = await fetch(
          `/api/marketplace/items/${item.id}/download`,
          {
            method: "POST",
          },
        );

        if (response.ok) {
          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = item.title;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);
        } else {
          const errorData = await response.json();
          throw new Error(errorData.message || "Download failed");
        }
      } catch (error) {
        console.error("Download error:", error);
        setError(error instanceof Error ? error.message : "Download failed");
      } finally {
        setIsLoading(false);
      }
    } else {
      // Paid item - redirect to Polar checkout
      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch("/api/marketplace/checkout", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            itemId: item.id,
            successUrl: `${window.location.origin}/marketplace/purchase/success?item=${item.id}`,
            cancelUrl: `${window.location.origin}/marketplace/items/${item.id}`,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(
            errorData.message || "Failed to create checkout session",
          );
        }

        const { checkoutUrl } = await response.json();

        // Redirect to Polar checkout
        window.location.href = checkoutUrl;
      } catch (error) {
        console.error("Checkout error:", error);
        setError(
          error instanceof Error ? error.message : "Failed to start checkout",
        );
        setIsLoading(false);
      }
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      whileHover={{ y: -5 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={cn(className)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <Link href={`/marketplace/items/${item.id}`}>
        <div className="group relative overflow-hidden rounded-2xl bg-white dark:bg-gray-800 shadow-lg hover:shadow-2xl transition-all duration-500 cursor-pointer border border-gray-200 dark:border-gray-700">
          {/* Holographic background effect */}
          <div className="absolute inset-0 opacity-0 group-hover:opacity-20 transition-opacity duration-500">
            <div className="absolute inset-0 bg-gradient-to-br from-purple-400 via-pink-400 to-blue-400 animate-pulse" />
            <div
              className="absolute inset-0 bg-gradient-to-tl from-cyan-400 via-green-400 to-yellow-400 mix-blend-overlay animate-pulse"
              style={{ animationDelay: "0.5s" }}
            />
          </div>

          {/* Featured badge */}
          {item.featured && (
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
              className="absolute top-3 left-3 z-10"
            >
              <div className="bg-gradient-to-r from-yellow-400 to-orange-500 text-white px-2 py-1 rounded-full text-xs font-bold flex items-center gap-1">
                <Zap size={12} />
                Featured
              </div>
            </motion.div>
          )}

          {/* Wishlist button */}
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={handleWishlistToggle}
            className="absolute top-3 right-3 z-10 p-2 rounded-full bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm hover:bg-white dark:hover:bg-gray-700 transition-colors group"
          >
            <Heart
              size={16}
              className={cn(
                "transition-colors",
                isInWishlist
                  ? "fill-red-500 text-red-500"
                  : "text-gray-600 dark:text-gray-300 group-hover:text-red-500",
              )}
            />
          </motion.button>

          {/* Image */}
          <div className="relative h-48 overflow-hidden">
            {Array.isArray(item.previewImages) &&
            item.previewImages.length > 0 ? (
              <Image
                src={item.previewImages[0] as string}
                alt={item.title}
                fill
                className="object-cover group-hover:scale-110 transition-transform duration-500"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-600 flex items-center justify-center">
                <Tag size={48} className="text-gray-400 dark:text-gray-500" />
              </div>
            )}

            {/* Overlay on hover */}
            <AnimatePresence>
              {isHovered && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 bg-black/20 backdrop-blur-[1px] flex items-center justify-center"
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    className="bg-white/90 dark:bg-gray-800/90 rounded-full p-3"
                  >
                    <Eye
                      size={20}
                      className="text-gray-800 dark:text-gray-200"
                    />
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Content */}
          <div className="p-4 space-y-3">
            {/* Type badge */}
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                {item.type.replace("_", " ")}
              </span>
              {averageRating > 0 && (
                <div className="flex items-center gap-1">
                  <Star size={12} className="fill-yellow-400 text-yellow-400" />
                  <span className="text-xs text-gray-600 dark:text-gray-400">
                    {averageRating.toFixed(1)}
                  </span>
                </div>
              )}
            </div>

            {/* Title */}
            <h3 className="font-semibold text-gray-900 dark:text-white line-clamp-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
              {item.title}
            </h3>

            {/* Description */}
            <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
              {item.shortDescription || item.description}
            </p>

            {/* Seller */}
            <div className="flex items-center gap-2">
              <User size={14} className="text-gray-400" />
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {item.seller?.user?.name || "Unknown Seller"}
              </span>
            </div>

            {/* Stats */}
            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1">
                  <Download size={12} />
                  <span>{item.downloadCount || 0}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Eye size={12} />
                  <span>{item.viewCount || 0}</span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Calendar size={12} />
                <span>{new Date(item.createdAt).toLocaleDateString()}</span>
              </div>
            </div>

            {/* Price and actions */}
            <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-1">
                <DollarSign
                  size={16}
                  className="text-green-600 dark:text-green-400"
                />
                <span className="font-bold text-lg text-gray-900 dark:text-white">
                  {Number(item.price) === 0
                    ? "Free"
                    : `$${Number(item.price).toFixed(2)}`}
                </span>
              </div>

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handlePurchase}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1 transition-colors"
              >
                <ShoppingCart size={14} />
                {isLoading ? "Processing..." : "Buy Now"}
              </motion.button>
            </div>
          </div>

          {/* License type */}
          {item.licenseType && (
            <div className="absolute bottom-2 left-2">
              <span className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                {item.licenseType}
              </span>
            </div>
          )}
        </div>
      </Link>
    </motion.div>
  );
};

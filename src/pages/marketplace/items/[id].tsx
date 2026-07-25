import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "@/src/components/layout/Layout";
import { useMarketplaceStore } from "@/src/store/marketplaceStore";
import { MarketplaceItemWithSeller } from "@/src/types/marketplace";
import {
  Star,
  Download,
  Eye,
  Heart,
  ShoppingCart,
  DollarSign,
  User,
  Calendar,
  Shield,
  CheckCircle,
  AlertCircle,
  ArrowLeft,
  Share2,
  Flag,
} from "react-feather";
import { motion } from "framer-motion";
import { cn } from "@/src/lib/utils";
import toast from "react-hot-toast";
import Image from "next/image";
import { useSession } from "@/src/lib/auth-client";
export default function MarketplaceItemPage() {
  const router = useRouter();
  const { id } = router.query;
  const { data: session } = useSession();
  const [item, setItem] = useState<MarketplaceItemWithSeller | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [isInWishlist, setIsInWishlist] = useState(false);

  const { addToWishlist, removeFromWishlist } = useMarketplaceStore();

  useEffect(() => {
    if (id) {
      fetchItem();
    }
  }, [id]);

  const fetchItem = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/marketplace/items/${id}`);
      if (!response.ok) throw new Error("Failed to fetch item");
      const data = await response.json();
      setItem(data);
    } catch (error) {
      setError("Failed to load item");
      console.error("Error fetching item:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleWishlistToggle = async () => {
    if (!session) {
      router.push("/auth/signin");
      return;
    }

    if (!item) return;

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

    if (!item) return;

    try {
      // Create checkout session
      const response = await fetch("/api/marketplace/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          itemId: item.id,
          productId: item.polarProductId,
        }),
      });

      if (!response.ok) throw new Error("Failed to create checkout");

      const { checkoutUrl } = await response.json();
      window.location.href = checkoutUrl;
    } catch (error) {
      toast.error("Failed to start checkout process");
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: item?.title,

          url: window.location.href,
        });
      } catch (error) {
        // User cancelled sharing
      }
    } else {
      // Fallback to copying URL
      navigator.clipboard.writeText(window.location.href);
      toast.success("Link copied to clipboard");
    }
  };

  const averageRating =
    item?.reviews && item.reviews.length > 0
      ? item.reviews.reduce(
          (sum: number, review: any) => sum + Number(review.rating),
          0,
        ) / item.reviews.length
      : 0;

  if (isLoading) {
    return (
      <Layout>
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="animate-pulse">
              <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/4 mb-8"></div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="h-96 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
                <div className="space-y-4">
                  <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
                  <div className="h-20 bg-gray-200 dark:bg-gray-700 rounded"></div>
                  <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded w-1/3"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  if (error || !item) {
    return (
      <Layout>
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
          <div className="text-center">
            <AlertCircle size={48} className="mx-auto text-red-500 mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Item Not Found
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              {error || "The item you're looking for doesn't exist."}
            </p>
            <button
              onClick={() => router.push("/marketplace")}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
            >
              Back to Marketplace
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Back Button */}
          <motion.button
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            onClick={() => router.back()}
            className="flex items-center space-x-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-8"
          >
            <ArrowLeft size={20} />
            <span>Back to Marketplace</span>
          </motion.button>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
            {/* Images */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              {/* Main Image */}
              <div className="relative h-96 bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden">
                {Array.isArray(item.previewImages) &&
                item.previewImages.length > 0 ? (
                  <Image
                    src={item.previewImages[selectedImageIndex] as string}
                    alt={item.title}
                    fill
                    className="object-cover"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <div className="text-6xl mb-2">📦</div>
                      <p className="text-gray-500 dark:text-gray-400">
                        No preview available
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Thumbnail Images */}
              {Array.isArray(item.previewImages) &&
                item.previewImages.length > 1 && (
                  <div className="flex space-x-2 overflow-x-auto">
                    {item.previewImages.map((image, index) => (
                      <button
                        key={index}
                        onClick={() => setSelectedImageIndex(index)}
                        className={cn(
                          "relative w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 border-2",
                          selectedImageIndex === index
                            ? "border-blue-500"
                            : "border-gray-200 dark:border-gray-700",
                        )}
                      >
                        <Image
                          src={image as string}
                          alt={`Preview ${index + 1}`}
                          fill
                          className="object-cover"
                        />
                      </button>
                    ))}
                  </div>
                )}
            </motion.div>

            {/* Item Info */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="space-y-6"
            >
              {/* Header */}
              <div>
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                      {item.type.replace("_", " ")}
                    </span>
                    {item.featured && (
                      <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
                        Featured
                      </span>
                    )}
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={handleShare}
                      className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      <Share2 size={18} />
                    </button>
                    <button
                      onClick={handleWishlistToggle}
                      className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      <Heart
                        size={18}
                        className={cn(
                          isInWishlist
                            ? "fill-red-500 text-red-500"
                            : "text-gray-600 dark:text-gray-400",
                        )}
                      />
                    </button>
                  </div>
                </div>

                <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                  {item.title}
                </h1>

                {/* Rating & Stats */}
                <div className="flex items-center space-x-6 text-sm text-gray-500 dark:text-gray-400">
                  {averageRating > 0 && (
                    <div className="flex items-center space-x-1">
                      <div className="flex items-center">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            size={16}
                            className={cn(
                              star <= averageRating
                                ? "text-yellow-400 fill-current"
                                : "text-gray-300",
                            )}
                          />
                        ))}
                      </div>
                      <span>
                        {averageRating.toFixed(1)} ({item.reviews?.length || 0}{" "}
                        reviews)
                      </span>
                    </div>
                  )}
                  <div className="flex items-center space-x-1">
                    <Download size={14} />
                    <span>{item.downloadCount || 0} downloads</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <Eye size={14} />
                    <span>{item.viewCount || 0} views</span>
                  </div>
                </div>
              </div>

              {/* Description */}
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
                  Description
                </h3>
                <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                  {item.description}
                </p>
              </div>

              {/* Price & Purchase */}
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="flex items-center space-x-2 mb-1">
                      <DollarSign
                        size={24}
                        className="text-green-600 dark:text-green-400"
                      />
                      <span className="text-3xl font-bold text-gray-900 dark:text-white">
                        {Number(item.price) === 0
                          ? "Free"
                          : `$${Number(item.price).toFixed(2)}`}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {item.licenseType} License
                    </p>
                  </div>
                  <div className="flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400">
                    <Shield size={16} />
                    <span>Secure Payment</span>
                  </div>
                </div>

                <button
                  onClick={handlePurchase}
                  className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center justify-center space-x-2"
                >
                  <ShoppingCart size={20} />
                  <span>
                    {Number(item.price) === 0
                      ? "Download Free"
                      : "Purchase Now"}
                  </span>
                </button>

                <div className="mt-4 flex items-center justify-center space-x-4 text-xs text-gray-500 dark:text-gray-400">
                  <div className="flex items-center space-x-1">
                    <CheckCircle size={12} />
                    <span>Instant Download</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <Shield size={12} />
                    <span>30-day Guarantee</span>
                  </div>
                </div>
              </div>

              {/* Seller Info */}
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-3">
                  Seller Information
                </h3>
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center">
                    {item.seller.user.image ? (
                      <Image
                        src={item.seller.user.image}
                        alt={item.seller.user.name || "Seller"}
                        width={48}
                        height={48}
                        className="rounded-full"
                      />
                    ) : (
                      <User size={24} className="text-gray-400" />
                    )}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {item.seller.user.name || "Anonymous Seller"}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {item.seller.storeName}
                    </p>
                    {item.seller.verified && (
                      <div className="flex items-center space-x-1 text-xs text-green-600 dark:text-green-400">
                        <CheckCircle size={12} />
                        <span>Verified Seller</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Additional Info */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500 dark:text-gray-400">
                    Added:
                  </span>
                  <div className="flex items-center space-x-1 text-gray-900 dark:text-white">
                    <Calendar size={14} />
                    <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">
                    Category:
                  </span>
                  <p className="text-gray-900 dark:text-white">
                    {item.category || "General"}
                  </p>
                </div>
              </div>

              {/* Tags */}
              {Array.isArray(item.tags) && item.tags.length > 0 && (
                <div>
                  <span className="text-sm text-gray-500 dark:text-gray-400 mb-2 block">
                    Tags:
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {item.tags.map((tag, index) => (
                      <span
                        key={index}
                        className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs rounded"
                      >
                        {tag as string}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          </div>

          {/* Reviews Section */}
          {item.reviews && item.reviews.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700"
            >
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-6">
                Reviews ({item.reviews.length})
              </h3>
              <div className="space-y-4">
                {item.reviews.slice(0, 5).map((review: any, index: number) => (
                  <div
                    key={index}
                    className="border-b border-gray-200 dark:border-gray-700 pb-4 last:border-b-0"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        <div className="flex items-center">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Star
                              key={star}
                              size={14}
                              className={cn(
                                star <= review.rating
                                  ? "text-yellow-400 fill-current"
                                  : "text-gray-300",
                              )}
                            />
                          ))}
                        </div>
                        <span className="font-medium text-gray-900 dark:text-white">
                          {review.reviewer?.name || "Anonymous"}
                        </span>
                      </div>
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {new Date(review.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-gray-600 dark:text-gray-400">
                      {review.comment}
                    </p>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Report Button */}
          <div className="mt-8 text-center">
            <button className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 flex items-center space-x-1 mx-auto">
              <Flag size={14} />
              <span>Report this item</span>
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
}

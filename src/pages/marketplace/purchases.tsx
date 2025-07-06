import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/src/components/layout/Layout';
import { motion } from 'framer-motion';
import {
  Download,
  Calendar,
  DollarSign,
  Package,
  Star,
  ArrowRight,
  RefreshCw
} from 'react-feather';
import { cn } from '@/src/lib/utils';
import toast from 'react-hot-toast';
import { useSession } from '@/src/lib/auth-client';
interface Purchase {
  id: string;
  orderNumber: string;
  item: {
    id: string;
    title: string;
    type: string;
    thumbnailUrl?: string;
  };
  totalPrice: number;
  status: string;
  completedAt: string;
  downloadCount: number;
  maxDownloads: number;
  downloadExpiresAt: string;
}

export default function PurchasesPage() {

  const router = useRouter();
  const { data: session } = useSession();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) {
      router.push('/auth/signin');
      return;
    }

    if (session) {
      fetchPurchases();
    }
  }, [session]);

  const fetchPurchases = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/marketplace/orders/my-purchases');
      if (!response.ok) throw new Error('Failed to fetch purchases');
      const data = await response.json();
      setPurchases(data);
    } catch (error) {
      setError('Failed to load purchases');
      console.error('Error fetching purchases:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = async (orderId: string, itemTitle: string) => {
    try {
      const response = await fetch(`/api/marketplace/orders/${orderId}/download`);
      if (!response.ok) throw new Error('Download failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = itemTitle;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success('Download started');
      fetchPurchases(); // Refresh to update download count
    } catch (error) {
      toast.error('Download failed');
    }
  };

  if (!session) {
    return (
      <Layout>
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                  My Purchases
                </h1>
                <p className="text-gray-600 dark:text-gray-400">
                  Download and manage your marketplace purchases
                </p>
              </div>
              <button
                onClick={fetchPurchases}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <RefreshCw size={16} />
                <span>Refresh</span>
              </button>
            </div>
          </motion.div>

          {/* Content */}
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-white dark:bg-gray-800 rounded-lg p-6 animate-pulse">
                  <div className="flex items-center space-x-4">
                    <div className="w-16 h-16 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
                      <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
                    </div>
                    <div className="h-10 w-24 bg-gray-200 dark:bg-gray-700 rounded"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <Package size={48} className="mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                Failed to Load Purchases
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">{error}</p>
              <button
                onClick={fetchPurchases}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
              >
                Try Again
              </button>
            </div>
          ) : purchases.length === 0 ? (
            <div className="text-center py-12">
              <Package size={48} className="mx-auto text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                No Purchases Yet
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                You havent made any purchases from the marketplace yet.
              </p>
              <button
                onClick={() => router.push('/marketplace')}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 flex items-center space-x-2 mx-auto"
              >
                <Package size={16} />
                <span>Browse Marketplace</span>
                <ArrowRight size={16} />
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {purchases.map((purchase) => (
                <motion.div
                  key={purchase.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700 hover:shadow-lg transition-shadow"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      {/* Item Thumbnail */}
                      <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center overflow-hidden">
                        {purchase.item.thumbnailUrl ? (
                          <img
                            src={purchase.item.thumbnailUrl}
                            alt={purchase.item.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Package size={24} className="text-gray-400" />
                        )}
                      </div>

                      {/* Item Info */}
                      <div>
                        <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
                          {purchase.item.title}
                        </h3>
                        <div className="flex items-center space-x-4 text-sm text-gray-500 dark:text-gray-400">
                          <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                            {purchase.item.type.replace('_', ' ')}
                          </span>
                          <div className="flex items-center space-x-1">
                            <Calendar size={12} />
                            <span>{new Date(purchase.completedAt).toLocaleDateString()}</span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <DollarSign size={12} />
                            <span>${purchase.totalPrice.toFixed(2)}</span>
                          </div>
                        </div>
                        <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                          Order #{purchase.orderNumber}
                        </div>
                      </div>
                    </div>

                    {/* Download Info & Action */}
                    <div className="text-right">
                      <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                        Downloads: {purchase.downloadCount}/{purchase.maxDownloads}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                        Expires: {new Date(purchase.downloadExpiresAt).toLocaleDateString()}
                      </div>

                      {purchase.downloadCount < purchase.maxDownloads &&
                        new Date() < new Date(purchase.downloadExpiresAt) ? (
                        <button
                          onClick={() => handleDownload(purchase.id, purchase.item.title)}
                          className="flex items-center space-x-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors text-sm"
                        >
                          <Download size={14} />
                          <span>Download</span>
                        </button>
                      ) : (
                        <div className="text-xs text-red-500 dark:text-red-400">
                          {purchase.downloadCount >= purchase.maxDownloads
                            ? 'Download limit reached'
                            : 'Download expired'}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Progress Bar for Downloads */}
                  {purchase.maxDownloads > 1 && (
                    <div className="mt-4">
                      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                        <span>Download Usage</span>
                        <span>{purchase.downloadCount}/{purchase.maxDownloads}</span>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                        <div
                          className={cn(
                            "h-2 rounded-full transition-all",
                            purchase.downloadCount >= purchase.maxDownloads
                              ? "bg-red-500"
                              : purchase.downloadCount > purchase.maxDownloads * 0.7
                                ? "bg-yellow-500"
                                : "bg-green-500"
                          )}
                          style={{
                            width: `${(purchase.downloadCount / purchase.maxDownloads) * 100}%`
                          }}
                        ></div>
                      </div>
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
} 
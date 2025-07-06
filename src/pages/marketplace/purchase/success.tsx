import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { motion } from 'framer-motion';
import { CheckCircle, Download, ArrowLeft, Package } from 'lucide-react';
import Link from 'next/link';
import { MarketplaceItem, MarketplaceOrder } from '@/src/types/marketplace';
import { useSession } from '@/src/lib/auth-client';
export default function PurchaseSuccess() {
  const router = useRouter();
  const { data: session } = useSession();
  const [order, setOrder] = useState<MarketplaceOrder | null>(null);
  const [item, setItem] = useState<MarketplaceItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { item: itemId, checkout_id } = router.query;

  useEffect(() => {
    if (!session || !itemId) return;

    fetchOrderDetails();
  }, [session, itemId, checkout_id]);

  const fetchOrderDetails = async () => {
    try {
      setLoading(true);

      // Get the purchased item details
      const itemResponse = await fetch(`/api/marketplace/items/${itemId}`);
      if (itemResponse.ok) {
        const itemData = await itemResponse.json();
        setItem(itemData);
      }

      // Get the order details
      const orderResponse = await fetch(`/api/marketplace/orders/my-purchases`);
      if (orderResponse.ok) {
        const orders = await orderResponse.json();
        const matchingOrder = orders.find((o: MarketplaceOrder) =>
          o.itemId === itemId || o.polarCheckoutId === checkout_id
        );
        if (matchingOrder) {
          setOrder(matchingOrder);
        }
      }

    } catch (error) {
      console.error('Error fetching order details:', error);
      setError('Failed to load purchase details');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!item) return;

    try {
      const response = await fetch(`/api/marketplace/orders/${order?.id}/download`, {
        method: 'POST',
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = item.title || 'download';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Download failed');
      }
    } catch (error) {
      console.error('Download error:', error);
      setError(error instanceof Error ? error.message : 'Download failed');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading your purchase details...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-pink-100 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-600 text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Purchase Error</h1>
          <p className="text-gray-600 mb-4">{error}</p>
          <Link href="/marketplace" className="text-blue-600 hover:underline">
            Return to Marketplace
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100">
      <div className="container mx-auto px-4 py-8">
        {/* Success Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 100 }}
          >
            <CheckCircle className="w-24 h-24 text-green-600 mx-auto mb-4" />
          </motion.div>
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Purchase Successful!
          </h1>
          <p className="text-gray-600 text-lg">
            Thank you for your purchase. Your item is ready for download.
          </p>
        </motion.div>

        {/* Purchase Details */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="max-w-2xl mx-auto bg-white rounded-lg shadow-lg p-6 mb-8"
        >
          <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
            <Package className="w-6 h-6" />
            Purchase Details
          </h2>

          {item && (
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-lg">{item.title}</h3>
                <p className="text-gray-600">{item.shortDescription}</p>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium">Type:</span>
                  <span className="ml-2 capitalize">{item.type}</span>
                </div>
                <div>
                  <span className="font-medium">License:</span>
                  <span className="ml-2">{item.licenseType}</span>
                </div>
                <div>
                  <span className="font-medium">Price:</span>
                  <span className="ml-2">
                    {item.price.toNumber() > 0 ? `$${item.price.toFixed(2)}` : 'Free'}
                  </span>
                </div>
                {order && (
                  <div>
                    <span className="font-medium">Order ID:</span>
                    <span className="ml-2 font-mono text-xs">{order.id}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </motion.div>

        {/* Download Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="max-w-2xl mx-auto bg-white rounded-lg shadow-lg p-6 mb-8"
        >
          <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
            <Download className="w-6 h-6" />
            Download Your Item
          </h2>

          <p className="text-gray-600 mb-4">
            Your purchase is complete and ready for download. Click the button below to download your item.
          </p>

          <div className="flex gap-4">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleDownload}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium flex items-center gap-2 transition-colors"
            >
              <Download className="w-5 h-5" />
              Download Now
            </motion.button>

            <Link href="/marketplace/purchases">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-3 rounded-lg font-medium transition-colors"
              >
                View All Purchases
              </motion.button>
            </Link>
          </div>

          <div className="mt-4 p-4 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-800">
              <strong>Note:</strong> Keep your order confirmation for your records.
              You can always re-download your purchased items from your purchases page.
            </p>
          </div>
        </motion.div>

        {/* Navigation */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-center"
        >
          <Link href="/marketplace" className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back to Marketplace
          </Link>
        </motion.div>
      </div>
    </div>
  );
} 
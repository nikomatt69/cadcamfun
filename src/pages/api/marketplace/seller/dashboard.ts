import { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/src/lib/api/auth';
import { prisma } from '@/src/lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  try {
    switch (req.method) {
      case 'GET':
        return await getSellerDashboard(req, res, userId);
      case 'PUT':
        return await updateSellerProfile(req, res, userId);
      default:
        res.setHeader('Allow', ['GET', 'PUT']);
        return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
    }
  } catch (error) {
    console.error('Seller dashboard API error:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('User ID:', userId);
    console.error('Method:', req.method);
    return res.status(500).json({ 
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error instanceof Error ? error.message : 'Unknown error' : undefined
    });
  }
}

async function getSellerDashboard(req: NextApiRequest, res: NextApiResponse, userId: string) {
  const { timeframe = '30' } = req.query; // Days
  const days = parseInt(timeframe as string);
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  // Get or create seller profile
  let seller = await prisma.marketplaceSeller.findUnique({
    where: { userId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true
        }
      }
    }
  });

  if (!seller) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true }
    });

    seller = await prisma.marketplaceSeller.create({
      data: {
        userId,
        storeName: user?.name || 'My Store',
        storeUrl: `store-${userId.slice(-8)}`
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true
          }
        }
      }
    });
  }

  // Get seller items with stats
  const items = await prisma.marketplaceItem.findMany({
    where: { sellerId: seller.id },
    include: {
      _count: {
        select: {
          orders: true,
          reviews: true,
          wishlists: true
        }
      },
      reviews: {
        select: {
          rating: true
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  // Get recent orders
  const recentOrders = await prisma.marketplaceOrder.findMany({
    where: {
      sellerId: seller.id,
      createdAt: {
        gte: startDate
      }
    },
    include: {
      item: {
        select: {
          id: true,
          title: true,
          type: true
        }
      },
      buyer: {
        select: {
          id: true,
          name: true,
          image: true
        }
      }
    },
    orderBy: { createdAt: 'desc' },
    take: 20
  });

  // Calculate analytics
  const analytics = await calculateSellerAnalytics(seller.id, days);

  // Get pending payouts
  const pendingPayouts = await prisma.marketplacePayout.findMany({
    where: {
      sellerId: seller.id,
      status: 'PENDING'
    },
    orderBy: { createdAt: 'desc' }
  });

  return res.status(200).json({
    seller,
    items: items.map(item => ({
      ...item,
      averageRating: item.reviews.length > 0 
        ? item.reviews.reduce((sum, r) => sum + r.rating, 0) / item.reviews.length 
        : 0
    })),
    recentOrders,
    analytics,
    pendingPayouts
  });
}

async function updateSellerProfile(req: NextApiRequest, res: NextApiResponse, userId: string) {
  const {
    storeName,
    storeDescription,
    storeUrl,
    commissionRate,
    payoutEmail
  } = req.body;

  // Validate storeUrl uniqueness
  if (storeUrl) {
    const existingSeller = await prisma.marketplaceSeller.findFirst({
      where: {
        storeUrl,
        userId: {
          not: userId
        }
      }
    });

    if (existingSeller) {
      return res.status(409).json({ message: 'Store URL already taken' });
    }
  }

  const updatedSeller = await prisma.marketplaceSeller.upsert({
    where: { userId },
    update: {
      storeName,
      storeDescription,
      storeUrl,
      commissionRate: commissionRate ? parseFloat(commissionRate) : undefined,
      payoutEmail
    },
    create: {
      userId,
      storeName: storeName || 'My Store',
      storeUrl: storeUrl || `store-${userId.slice(-8)}`,
      storeDescription,
      commissionRate: commissionRate ? parseFloat(commissionRate) : 15,
      payoutEmail
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true
        }
      }
    }
  });

  return res.status(200).json(updatedSeller);
}

async function calculateSellerAnalytics(sellerId: string, days: number) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  try {
    const [
      totalSales,
      totalRevenue,
      totalOrders,
      salesData,
      topItems,
      revenueByType
    ] = await Promise.all([
    // Total sales count
    prisma.marketplaceOrder.count({
      where: {
        sellerId,
        status: 'COMPLETED',
        createdAt: {
          gte: startDate
        }
      }
    }),

    // Total revenue
    prisma.marketplaceOrder.aggregate({
      where: {
        sellerId,
        status: 'COMPLETED',
        createdAt: {
          gte: startDate
        }
      },
      _sum: {
        sellerAmount: true
      }
    }),

    // Total orders (including pending)
    prisma.marketplaceOrder.count({
      where: {
        sellerId,
        createdAt: {
          gte: startDate
        }
      }
    }),

    // Daily sales data for chart
    prisma.$queryRaw`
      SELECT 
        DATE("createdAt") as date,
        COUNT(*) as sales,
        SUM("sellerAmount") as revenue
      FROM "MarketplaceOrder" 
      WHERE "sellerId" = ${sellerId} 
        AND status = 'COMPLETED'
        AND "createdAt" >= ${startDate}
      GROUP BY DATE("createdAt")
      ORDER BY date ASC
    `,

    // Top selling items
    prisma.marketplaceOrder.groupBy({
      by: ['itemId'],
      where: {
        sellerId,
        status: 'COMPLETED',
        createdAt: {
          gte: startDate
        }
      },
      _count: {
        id: true
      },
      _sum: {
        sellerAmount: true
      },
      orderBy: {
        _count: {
          id: 'desc'
        }
      },
      take: 5
    }),

    // Revenue by item type
    prisma.$queryRaw`
      SELECT 
        mi.type,
        COUNT(mo.id) as sales,
        SUM(mo."sellerAmount") as revenue
      FROM "MarketplaceOrder" mo
      JOIN "MarketplaceItem" mi ON mo."itemId" = mi.id
      WHERE mo."sellerId" = ${sellerId}
        AND mo.status = 'COMPLETED'
        AND mo."createdAt" >= ${startDate}
      GROUP BY mi.type
      ORDER BY revenue DESC
    `
  ]);

  // Get item details for top items
  const topItemsWithDetails = await Promise.all(
    (topItems as any[]).map(async (item) => {
      const itemDetails = await prisma.marketplaceItem.findUnique({
        where: { id: item.itemId },
        select: {
          id: true,
          title: true,
          type: true,
          price: true
        }
      });
      return {
        ...itemDetails,
        sales: item._count.id,
        revenue: item._sum.sellerAmount
      };
    })
  );

    return {
      totalSales,
      totalRevenue: totalRevenue._sum.sellerAmount || 0,
      totalOrders,
      salesData,
      topItems: topItemsWithDetails,
      revenueByType,
      conversionRate: totalOrders > 0 ? (totalSales / totalOrders) * 100 : 0
    };
  } catch (error) {
    console.error('Analytics calculation error:', error);
    // Return default analytics if calculation fails
    return {
      totalSales: 0,
      totalRevenue: 0,
      totalOrders: 0,
      salesData: [],
      topItems: [],
      revenueByType: [],
      conversionRate: 0
    };
  }
} 
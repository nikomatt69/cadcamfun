import { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/src/lib/api/auth';
import { prisma } from '@/src/lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
  }

  try {
    const userId = await requireAuth(req, res);
    if (!userId) return;

    const purchases = await prisma.marketplaceOrder.findMany({
      where: {
        buyerId: userId,
        status: 'COMPLETED'
      },
      include: {
        item: {
          select: {
            id: true,
            title: true,
            type: true,
            previewImages: true
          }
        }
      },
      orderBy: {
        completedAt: 'desc'
      }
    });

    // Transform the data to match the frontend interface
    const transformedPurchases = purchases.map(purchase => ({
      id: purchase.id,
      orderNumber: purchase.orderNumber,
      item: {
        id: purchase.item.id,
        title: purchase.item.title,
        type: purchase.item.type,
        thumbnailUrl: purchase.item.previewImages?.[0] || null
      },
      totalPrice: Number(purchase.totalPrice),
      status: purchase.status,
      completedAt: purchase.completedAt,
      downloadCount: purchase.downloadCount || 0,
      maxDownloads: purchase.maxDownloads || 3,
      downloadExpiresAt: purchase.downloadExpiresAt
    }));

    return res.status(200).json(transformedPurchases);
  } catch (error) {
    console.error('Error fetching purchases:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
} 
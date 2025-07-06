import { NextApiRequest, NextApiResponse } from 'next';
import { requireAuth } from '@/src/lib/api/auth';
import { prisma } from '@/src/lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const userId = await requireAuth(req, res);
  if (!userId) return;

  try {
    switch (req.method) {
      case 'GET':
        return await getWishlist(req, res, userId);
      case 'POST':
        return await addToWishlist(req, res, userId);
      case 'DELETE':
        return await removeFromWishlist(req, res, userId);
      default:
        res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
        return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
    }
  } catch (error) {
    console.error('Wishlist API error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

async function getWishlist(req: NextApiRequest, res: NextApiResponse, userId: string) {
  const {
    page = '1',
    limit = '20'
  } = req.query;

  const pageNum = parseInt(page as string);
  const limitNum = parseInt(limit as string);
  const skip = (pageNum - 1) * limitNum;

  const [wishlistItems, total] = await Promise.all([
    prisma.marketplaceWishlist.findMany({
      where: { userId },
      include: {
        item: {
          include: {
            seller: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    image: true
                  }
                }
              }
            },
            reviews: {
              select: {
                rating: true
              }
            },
            _count: {
              select: {
                reviews: true,
                orders: true
              }
            }
          }
        }
      },
      orderBy: { addedAt: 'desc' },
      skip,
      take: limitNum
    }),
    prisma.marketplaceWishlist.count({
      where: { userId }
    })
  ]);

  return res.status(200).json({
    items: wishlistItems.map(w => ({
      ...w.item,
      addedAt: w.addedAt
    })),
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum)
    }
  });
}

async function addToWishlist(req: NextApiRequest, res: NextApiResponse, userId: string) {
  const { itemId } = req.body;

  if (!itemId) {
    return res.status(400).json({ message: 'Item ID is required' });
  }

  // Check if item exists and is approved
  const item = await prisma.marketplaceItem.findFirst({
    where: {
      id: itemId,
      status: 'APPROVED'
    }
  });

  if (!item) {
    return res.status(404).json({ message: 'Item not found or not available' });
  }

  // Check if already in wishlist
  const existingWishlistItem = await prisma.marketplaceWishlist.findUnique({
    where: {
      userId_itemId: {
        userId,
        itemId
      }
    }
  });

  if (existingWishlistItem) {
    return res.status(409).json({ message: 'Item already in wishlist' });
  }

  // Add to wishlist
  const wishlistItem = await prisma.marketplaceWishlist.create({
    data: {
      userId,
      itemId
    },
    include: {
      item: {
        include: {
          seller: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  image: true
                }
              }
            }
          }
        }
      }
    }
  });

  return res.status(201).json(wishlistItem);
}

async function removeFromWishlist(req: NextApiRequest, res: NextApiResponse, userId: string) {
  const { itemId } = req.body;

  if (!itemId) {
    return res.status(400).json({ message: 'Item ID is required' });
  }

  // Check if item is in wishlist
  const existingWishlistItem = await prisma.marketplaceWishlist.findUnique({
    where: {
      userId_itemId: {
        userId,
        itemId
      }
    }
  });

  if (!existingWishlistItem) {
    return res.status(404).json({ message: 'Item not found in wishlist' });
  }

  // Remove from wishlist
  await prisma.marketplaceWishlist.delete({
    where: {
      userId_itemId: {
        userId,
        itemId
      }
    }
  });

  return res.status(200).json({ message: 'Item removed from wishlist' });
} 
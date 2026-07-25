import { NextApiRequest, NextApiResponse } from "next";
import { requireAuth } from "src/lib/api/auth";
import { prisma } from "@/src/lib/prisma";
import { MarketplaceFilters } from "@/src/types/marketplace";
import { POLAR_CONFIG } from "@/src/lib/polar/config";
import { Polar } from "@polar-sh/sdk";

const polar = new Polar({
  accessToken: POLAR_CONFIG.accessToken,
});

// Auto-validation rules for marketplace items
async function autoValidateItem(data: {
  title: string;
  description?: string;
  type: string;
  price: number;
  tags?: string[];
  previewImages?: string[];
  seller: any;
}): Promise<boolean> {
  console.log("🔍 Auto-validating item:", data.title);

  // Basic validation checks
  const checks = {
    hasTitle: data.title && data.title.length >= 3,
    hasDescription: data.description && data.description.length >= 10,
    hasValidPrice: data.price >= 0,
    hasValidType: [
      "COMPONENT",
      "DRAWING",
      "PROJECT",
      "GCODE",
      "TOOLPATH",
      "ASSEMBLY",
      "MATERIAL",
    ].includes(data.type),
    sellerVerified: data.seller && !data.seller.suspended,
    hasPreviewImages:
      Array.isArray(data.previewImages) && data.previewImages.length > 0,
  };

  // Content quality checks
  const contentScore = calculateContentScore(data);
  const isHighQuality = contentScore >= 70; // 70% quality threshold

  // Auto-approve if all basic checks pass and content quality is good
  const shouldAutoApprove =
    Object.values(checks).every(Boolean) && isHighQuality;

  console.log("✅ Validation results:", {
    checks,
    contentScore,
    shouldAutoApprove,
  });

  return shouldAutoApprove;
}

// Calculate content quality score (0-100)
function calculateContentScore(data: {
  title: string;
  description?: string;
  tags?: string[];
  previewImages?: string[];
}): number {
  let score = 0;

  // Title quality (0-20 points)
  if (data.title.length >= 10) score += 15;
  if (data.title.length >= 20) score += 5;
  if (!/^[A-Z]/.test(data.title)) score -= 5; // Should start with capital letter

  // Description quality (0-30 points)
  if (data.description) {
    if (data.description.length >= 50) score += 15;
    if (data.description.length >= 100) score += 10;
    if (data.description.length >= 200) score += 5;
  }

  // Tags quality (0-20 points)
  if (data.tags && data.tags.length > 0) {
    score += Math.min(data.tags.length * 5, 20);
  }

  // Images quality (0-30 points)
  if (Array.isArray(data.previewImages) && data.previewImages.length > 0) {
    score += Math.min(data.previewImages.length * 10, 30);
  }

  return Math.min(score, 100);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    if (req.method === "GET") {
      return await getMarketplaceItems(req, res);
    } else if (req.method === "POST") {
      const userId = await requireAuth(req, res);

      if (!userId) return;
      return await createMarketplaceItem(req, res, userId);
    }

    res.setHeader("Allow", ["GET", "POST"]);
    return res
      .status(405)
      .json({ message: `Method ${req.method} Not Allowed` });
  } catch (error) {
    console.error("Marketplace items API error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

async function getMarketplaceItems(req: NextApiRequest, res: NextApiResponse) {
  const {
    search,
    type,
    category,
    priceMin,
    priceMax,
    licenseType,
    tags,
    sellerId,
    featured,
    sortBy = "newest",
    page = "1",
    limit = "20",
  } = req.query as unknown as Partial<MarketplaceFilters> & {
    page: string;
    limit: string;
  };

  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const skip = (pageNum - 1) * limitNum;

  // Build where clause
  const where: any = {
    status: "APPROVED",
  };

  if (search) {
    where.OR = [
      { title: { contains: search } },
      { description: { contains: search } },
      { tags: { hasSome: [search] } },
    ];
  }

  if (type) where.type = type;
  if (category) where.category = category;
  if (licenseType) where.licenseType = licenseType;
  if (sellerId) where.sellerId = sellerId;
  if (featured !== undefined) where.featured = String(featured) === "true";
  if (tags) where.tags = { hasSome: Array.isArray(tags) ? tags : [tags] };

  if (priceMin || priceMax) {
    where.price = {};
    if (priceMin) where.price.gte = parseFloat(String(priceMin));
    if (priceMax) where.price.lte = parseFloat(String(priceMax));
  }

  // Build orderBy
  let orderBy: any;
  switch (sortBy) {
    case "oldest":
      orderBy = { createdAt: "asc" };
      break;
    case "price_low":
      orderBy = { price: "asc" };
      break;
    case "price_high":
      orderBy = { price: "desc" };
      break;
    case "rating":
      orderBy = { rating: "desc" };
      break;
    case "downloads":
      orderBy = { downloadCount: "desc" };
      break;
    default:
      orderBy = { createdAt: "desc" };
  }

  const [items, total] = await Promise.all([
    prisma.marketplaceItem.findMany({
      where,
      include: {
        seller: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                image: true,
              },
            },
          },
        },
        reviews: {
          select: {
            rating: true,
          },
        },
        _count: {
          select: {
            reviews: true,
            orders: true,
          },
        },
      },
      orderBy,
      skip,
      take: limitNum,
    }),
    prisma.marketplaceItem.count({ where }),
  ]);

  return res.status(200).json({
    items,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum),
    },
  });
}

async function createMarketplaceItem(
  req: NextApiRequest,
  res: NextApiResponse,
  userId: string,
) {
  const {
    title,
    description,
    shortDescription,
    type,
    price,
    licenseType,
    tags,
    category,
    subcategory,
    originalItemId,
    originalItemType,
    previewImages = [],
  } = req.body;

  // Validate required fields
  if (!title || !type || !price || !originalItemId || !originalItemType) {
    return res.status(400).json({
      message:
        "Missing required fields: title, type, price, originalItemId, originalItemType",
    });
  }

  // Get or create seller profile
  let seller = await prisma.marketplaceSeller.findUnique({
    where: { userId },
  });

  if (!seller) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });

    seller = await prisma.marketplaceSeller.create({
      data: {
        userId,
        storeName: user?.name || "My Store",
        storeUrl: `store-${userId.slice(-8)}`,
      },
    });
  }

  try {
    // Polar integration temporarily disabled due to SDK validation issues
    // Items will be created without payment integration for now
    let polarProductId: string | null = null;
    console.log(
      "⚠️ Polar integration disabled - SDK requires recurringInterval for one-time products",
    );

    // Auto-validate and approve item
    const isAutoApproved = await autoValidateItem({
      title,
      description,
      type,
      price,
      tags,
      previewImages,
      seller,
    });

    // Create marketplace item
    const item = await prisma.marketplaceItem.create({
      data: {
        title,
        description,
        shortDescription,
        type,
        price,
        licenseType: licenseType || "PERSONAL",
        tags: Array.isArray(tags) ? tags : [],
        category,
        subcategory,
        originalItemId,
        originalItemType,
        previewImages,
        sellerId: seller.id,
        polarProductId,
        status: isAutoApproved ? "APPROVED" : "PENDING_REVIEW",
        approvedAt: isAutoApproved ? new Date() : null,
        approvedBy: isAutoApproved ? "SYSTEM_AUTO" : null,
      },
      include: {
        seller: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                image: true,
              },
            },
          },
        },
      },
    });

    return res.status(201).json(item);
  } catch (error: any) {
    console.error("Error creating marketplace item:", error);
    return res.status(500).json({
      message: "Failed to create marketplace item",
      error: error.message,
    });
  }
}

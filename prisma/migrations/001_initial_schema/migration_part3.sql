-- Continuation of migration.sql - Part 3 (Production Costs & Marketplace)

-- CreateTable
CREATE TABLE "ToolWearCost" (
    "id" TEXT NOT NULL,
    "toolId" TEXT NOT NULL,
    "wearRatePerMeter" DOUBLE PRECISION NOT NULL,
    "replacementCost" DOUBLE PRECISION NOT NULL,
    "replacementThreshold" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "currencyCode" TEXT NOT NULL DEFAULT 'EUR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ownerId" TEXT,
    "organizationId" TEXT,

    CONSTRAINT "ToolWearCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialCost" (
    "id" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "costPerUnit" DOUBLE PRECISION NOT NULL,
    "wasteFactor" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "minimumCharge" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currencyCode" TEXT NOT NULL DEFAULT 'EUR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ownerId" TEXT,
    "organizationId" TEXT,

    CONSTRAINT "MaterialCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationCost" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "machineHourlyRate" DOUBLE PRECISION NOT NULL,
    "operatorHourlyRate" DOUBLE PRECISION NOT NULL,
    "setupTime" DOUBLE PRECISION NOT NULL DEFAULT 30,
    "currencyCode" TEXT NOT NULL DEFAULT 'EUR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ownerId" TEXT NOT NULL,
    "organizationId" TEXT,

    CONSTRAINT "OperationCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionCostEstimate" (
    "id" TEXT NOT NULL,
    "toolpathId" TEXT NOT NULL,
    "materialCost" DOUBLE PRECISION NOT NULL,
    "toolWearCost" DOUBLE PRECISION NOT NULL,
    "machineTime" DOUBLE PRECISION NOT NULL,
    "machineTimeCost" DOUBLE PRECISION NOT NULL,
    "operatorTime" DOUBLE PRECISION NOT NULL,
    "operatorTimeCost" DOUBLE PRECISION NOT NULL,
    "setupCost" DOUBLE PRECISION NOT NULL,
    "totalCost" DOUBLE PRECISION NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT 'EUR',
    "details" JSONB NOT NULL DEFAULT '{}',
    "operationCostId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ownerId" TEXT NOT NULL,
    "organizationId" TEXT,

    CONSTRAINT "ProductionCostEstimate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostSettings" (
    "id" TEXT NOT NULL,
    "defaultCurrencyCode" TEXT NOT NULL DEFAULT 'EUR',
    "defaultMachineHourlyRate" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "defaultOperatorHourlyRate" DOUBLE PRECISION NOT NULL DEFAULT 30,
    "defaultSetupTime" DOUBLE PRECISION NOT NULL DEFAULT 30,
    "calculateAutomatically" BOOLEAN NOT NULL DEFAULT true,
    "additionalSettings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ownerId" TEXT NOT NULL,
    "organizationId" TEXT,

    CONSTRAINT "CostSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MCPServerConfig" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'sse',
    "url" TEXT,
    "command" TEXT,
    "args" JSONB,
    "workingDirectory" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MCPServerConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceItem" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "shortDescription" TEXT,
    "type" "MarketplaceItemType" NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "licenseType" "LicenseType" NOT NULL DEFAULT 'PERSONAL',
    "tags" TEXT[],
    "category" TEXT,
    "subcategory" TEXT,
    "thumbnailUrl" TEXT,
    "previewImages" TEXT[],
    "downloadUrl" TEXT,
    "fileSize" INTEGER,
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "rating" DECIMAL(3,2),
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "status" "MarketplaceItemStatus" NOT NULL DEFAULT 'DRAFT',
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "polarProductId" TEXT,
    "sellerId" TEXT NOT NULL,
    "originalItemId" TEXT,
    "originalItemType" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,

    CONSTRAINT "MarketplaceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceSeller" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "storeName" TEXT NOT NULL,
    "storeDescription" TEXT,
    "storeUrl" TEXT,
    "avatar" TEXT,
    "banner" TEXT,
    "rating" DECIMAL(3,2),
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "totalSales" INTEGER NOT NULL DEFAULT 0,
    "totalRevenue" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "commissionRate" DECIMAL(5,2) NOT NULL DEFAULT 15.00,
    "payoutEmail" TEXT,
    "taxInfo" JSONB NOT NULL DEFAULT '{}',
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "suspended" BOOLEAN NOT NULL DEFAULT false,
    "polarCustomerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceSeller_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceOrder" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "totalPrice" DECIMAL(10,2) NOT NULL,
    "commissionAmount" DECIMAL(10,2) NOT NULL,
    "sellerAmount" DECIMAL(10,2) NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "status" "MarketplaceOrderStatus" NOT NULL DEFAULT 'PENDING',
    "polarCheckoutId" TEXT,
    "polarPaymentId" TEXT,
    "downloadUrl" TEXT,
    "downloadExpiresAt" TIMESTAMP(3),
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "maxDownloads" INTEGER DEFAULT 3,
    "licenseKey" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "MarketplaceOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceReview" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "title" TEXT,
    "comment" TEXT,
    "helpful" INTEGER NOT NULL DEFAULT 0,
    "reported" BOOLEAN NOT NULL DEFAULT false,
    "verified" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "parentId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceCollection" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "slug" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "sellerId" TEXT NOT NULL,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceCollection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceCollectionItem" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketplaceCollectionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceWishlist" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketplaceWishlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplacePayout" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "payoutMethod" TEXT NOT NULL,
    "transactionId" TEXT,
    "processedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplacePayout_pkey" PRIMARY KEY ("id")
);

-- Continue with indexes and constraints in part 4... 
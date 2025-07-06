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

-- CreateIndex
CREATE UNIQUE INDEX "CostSettings_ownerId_key" ON "CostSettings"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "CostSettings_organizationId_key" ON "CostSettings"("organizationId");

-- AddForeignKey
ALTER TABLE "ToolWearCost" ADD CONSTRAINT "ToolWearCost_toolId_fkey" FOREIGN KEY ("toolId") REFERENCES "Tool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolWearCost" ADD CONSTRAINT "ToolWearCost_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolWearCost" ADD CONSTRAINT "ToolWearCost_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialCost" ADD CONSTRAINT "MaterialCost_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialCost" ADD CONSTRAINT "MaterialCost_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialCost" ADD CONSTRAINT "MaterialCost_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationCost" ADD CONSTRAINT "OperationCost_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperationCost" ADD CONSTRAINT "OperationCost_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionCostEstimate" ADD CONSTRAINT "ProductionCostEstimate_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionCostEstimate" ADD CONSTRAINT "ProductionCostEstimate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionCostEstimate" ADD CONSTRAINT "ProductionCostEstimate_toolpathId_fkey" FOREIGN KEY ("toolpathId") REFERENCES "Toolpath"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionCostEstimate" ADD CONSTRAINT "ProductionCostEstimate_operationCostId_fkey" FOREIGN KEY ("operationCostId") REFERENCES "OperationCost"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostSettings" ADD CONSTRAINT "CostSettings_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostSettings" ADD CONSTRAINT "CostSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

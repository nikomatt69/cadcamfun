-- CreateTable
CREATE TABLE "MCPServerConfig" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'sse',
    "url" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MCPServerConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MCPServerConfig_userId_idx" ON "MCPServerConfig"("userId");

-- CreateTable
CREATE TABLE "ComponentVersion" (
    "id" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "changeMessage" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComponentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComponentComment" (
    "id" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComponentComment_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ComponentVersion" ADD CONSTRAINT "ComponentVersion_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "Component"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComponentVersion" ADD CONSTRAINT "ComponentVersion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComponentComment" ADD CONSTRAINT "ComponentComment_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "Component"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComponentComment" ADD CONSTRAINT "ComponentComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

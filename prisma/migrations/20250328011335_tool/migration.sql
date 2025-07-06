/*
  Warnings:

  - You are about to drop the `ToolPath` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "ToolPath" DROP CONSTRAINT "ToolPath_drawingId_fkey";

-- DropForeignKey
ALTER TABLE "ToolPath" DROP CONSTRAINT "ToolPath_machineConfigId_fkey";

-- DropForeignKey
ALTER TABLE "ToolPath" DROP CONSTRAINT "ToolPath_materialId_fkey";

-- DropForeignKey
ALTER TABLE "ToolPath" DROP CONSTRAINT "ToolPath_toolId_fkey";

-- DropTable
DROP TABLE "ToolPath";

-- CreateTable
CREATE TABLE "Toolpath" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "data" JSONB,
    "type" TEXT,
    "operationType" TEXT,
    "gcode" TEXT,
    "thumbnail" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "drawingId" TEXT,
    "materialId" TEXT,
    "toolId" TEXT,
    "machineConfigId" TEXT,

    CONSTRAINT "Toolpath_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToolpathVersion" (
    "id" TEXT NOT NULL,
    "toolpathId" TEXT NOT NULL,
    "data" JSONB,
    "gcode" TEXT,
    "changeMessage" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ToolpathVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToolpathComment" (
    "id" TEXT NOT NULL,
    "toolpathId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ToolpathComment_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Toolpath" ADD CONSTRAINT "Toolpath_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Toolpath" ADD CONSTRAINT "Toolpath_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Toolpath" ADD CONSTRAINT "Toolpath_drawingId_fkey" FOREIGN KEY ("drawingId") REFERENCES "Drawing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Toolpath" ADD CONSTRAINT "Toolpath_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Toolpath" ADD CONSTRAINT "Toolpath_toolId_fkey" FOREIGN KEY ("toolId") REFERENCES "Tool"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Toolpath" ADD CONSTRAINT "Toolpath_machineConfigId_fkey" FOREIGN KEY ("machineConfigId") REFERENCES "MachineConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolpathVersion" ADD CONSTRAINT "ToolpathVersion_toolpathId_fkey" FOREIGN KEY ("toolpathId") REFERENCES "Toolpath"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolpathVersion" ADD CONSTRAINT "ToolpathVersion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolpathComment" ADD CONSTRAINT "ToolpathComment_toolpathId_fkey" FOREIGN KEY ("toolpathId") REFERENCES "Toolpath"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolpathComment" ADD CONSTRAINT "ToolpathComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

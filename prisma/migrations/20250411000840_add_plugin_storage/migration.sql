-- CreateTable
CREATE TABLE "PluginRegistryEntry" (
    "id" TEXT NOT NULL,
    "manifestJson" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "version" TEXT NOT NULL,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,

    CONSTRAINT "PluginRegistryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PluginConfiguration" (
    "pluginId" TEXT NOT NULL,
    "configJson" TEXT NOT NULL,

    CONSTRAINT "PluginConfiguration_pkey" PRIMARY KEY ("pluginId")
);

-- AddForeignKey
ALTER TABLE "PluginConfiguration" ADD CONSTRAINT "PluginConfiguration_pluginId_fkey" FOREIGN KEY ("pluginId") REFERENCES "PluginRegistryEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

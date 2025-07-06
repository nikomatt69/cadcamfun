-- AlterTable
ALTER TABLE "MCPServerConfig" ADD COLUMN     "args" JSONB,
ADD COLUMN     "command" TEXT,
ADD COLUMN     "workingDirectory" TEXT,
ALTER COLUMN "url" DROP NOT NULL;

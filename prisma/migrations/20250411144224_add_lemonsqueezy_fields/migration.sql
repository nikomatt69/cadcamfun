-- DropIndex
DROP INDEX "Subscription_stripeCustomerId_key";

-- DropIndex
DROP INDEX "Subscription_stripeSubscriptionId_key";

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lsCurrentPeriodEnd" TIMESTAMP(3),
ADD COLUMN     "lsCustomerId" TEXT,
ADD COLUMN     "lsSubscriptionId" TEXT,
ADD COLUMN     "lsVariantId" TEXT,
ALTER COLUMN "plan" SET DEFAULT 'FREE',
ALTER COLUMN "status" SET DEFAULT 'inactive';

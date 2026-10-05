CREATE TABLE `AIAnalysisLog` (
	`id` text PRIMARY KEY,
	`userId` text NOT NULL,
	`objectId` text NOT NULL,
	`objectType` text NOT NULL,
	`analysisType` text NOT NULL,
	`result` text NOT NULL,
	`createdAt` integer NOT NULL,
	CONSTRAINT `fk_AIAnalysisLog_userId_User_id_fk` FOREIGN KEY (`userId`) REFERENCES `User`(`id`)
);
--> statement-breakpoint
CREATE TABLE `Account` (
	`id` text PRIMARY KEY,
	`userId` text NOT NULL,
	`accountId` text NOT NULL,
	`providerId` text NOT NULL,
	`accessToken` text,
	`refreshToken` text,
	`idToken` text,
	`accessTokenExpiresAt` integer,
	`refreshTokenExpiresAt` integer,
	`scope` text,
	`password` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	CONSTRAINT `fk_Account_userId_User_id_fk` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `ActivityLog` (
	`id` text PRIMARY KEY,
	`userId` text NOT NULL,
	`itemId` text NOT NULL,
	`itemType` text NOT NULL,
	`action` text NOT NULL,
	`details` text,
	`timestamp` integer NOT NULL,
	CONSTRAINT `fk_ActivityLog_userId_User_id_fk` FOREIGN KEY (`userId`) REFERENCES `User`(`id`)
);
--> statement-breakpoint
CREATE TABLE `ApiKey` (
	`id` text PRIMARY KEY,
	`keyHash` text NOT NULL UNIQUE,
	`name` text NOT NULL,
	`userId` text NOT NULL,
	`createdAt` integer NOT NULL,
	`lastUsed` integer,
	`expiresAt` integer,
	CONSTRAINT `fk_ApiKey_userId_User_id_fk` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `authenticators` (
	`id` text PRIMARY KEY,
	`userId` text NOT NULL,
	`credentialID` text NOT NULL UNIQUE,
	`credentialPublicKey` blob NOT NULL,
	`counter` integer NOT NULL,
	`credentialDeviceType` text NOT NULL,
	`credentialBackedUp` integer NOT NULL,
	`transports` text,
	CONSTRAINT `fk_authenticators_userId_User_id_fk` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `ComponentComment` (
	`id` text PRIMARY KEY,
	`componentId` text NOT NULL,
	`content` text NOT NULL,
	`userId` text NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	CONSTRAINT `fk_ComponentComment_componentId_Component_id_fk` FOREIGN KEY (`componentId`) REFERENCES `Component`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_ComponentComment_userId_User_id_fk` FOREIGN KEY (`userId`) REFERENCES `User`(`id`)
);
--> statement-breakpoint
CREATE TABLE `Component` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`description` text,
	`data` text NOT NULL,
	`thumbnail` text,
	`type` text,
	`isPublic` integer DEFAULT false NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`projectId` text NOT NULL,
	CONSTRAINT `fk_Component_projectId_Project_id_fk` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `ComponentVersion` (
	`id` text PRIMARY KEY,
	`componentId` text NOT NULL,
	`data` text NOT NULL,
	`changeMessage` text,
	`userId` text NOT NULL,
	`createdAt` integer NOT NULL,
	CONSTRAINT `fk_ComponentVersion_componentId_Component_id_fk` FOREIGN KEY (`componentId`) REFERENCES `Component`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_ComponentVersion_userId_User_id_fk` FOREIGN KEY (`userId`) REFERENCES `User`(`id`)
);
--> statement-breakpoint
CREATE TABLE `ConversationParticipant` (
	`id` text PRIMARY KEY,
	`userId` text NOT NULL,
	`conversationId` text NOT NULL,
	`joinedAt` integer NOT NULL,
	`lastReadAt` integer,
	CONSTRAINT `fk_ConversationParticipant_userId_User_id_fk` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_ConversationParticipant_conversationId_Conversation_id_fk` FOREIGN KEY (`conversationId`) REFERENCES `Conversation`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `Conversation` (
	`id` text PRIMARY KEY,
	`name` text,
	`organizationId` text NOT NULL,
	`isGroupChat` integer DEFAULT false NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	CONSTRAINT `fk_Conversation_organizationId_Organization_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `CostSettings` (
	`id` text PRIMARY KEY,
	`defaultCurrencyCode` text DEFAULT 'EUR' NOT NULL,
	`defaultMachineHourlyRate` real DEFAULT 50 NOT NULL,
	`defaultOperatorHourlyRate` real DEFAULT 30 NOT NULL,
	`defaultSetupTime` real DEFAULT 30 NOT NULL,
	`calculateAutomatically` integer DEFAULT true NOT NULL,
	`additionalSettings` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`ownerId` text NOT NULL UNIQUE,
	`organizationId` text UNIQUE,
	CONSTRAINT `fk_CostSettings_ownerId_User_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`),
	CONSTRAINT `fk_CostSettings_organizationId_Organization_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`)
);
--> statement-breakpoint
CREATE TABLE `Drawing` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`description` text,
	`data` text NOT NULL,
	`thumbnail` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`projectId` text NOT NULL,
	CONSTRAINT `fk_Drawing_projectId_Project_id_fk` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `DrawingVersion` (
	`id` text PRIMARY KEY,
	`version` integer NOT NULL,
	`data` text NOT NULL,
	`createdAt` integer NOT NULL,
	`drawingId` text NOT NULL,
	CONSTRAINT `fk_DrawingVersion_drawingId_Drawing_id_fk` FOREIGN KEY (`drawingId`) REFERENCES `Drawing`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `FileUpload` (
	`id` text PRIMARY KEY,
	`fileName` text NOT NULL,
	`s3Key` text NOT NULL,
	`s3Bucket` text NOT NULL,
	`s3ContentType` text NOT NULL,
	`s3Size` integer NOT NULL,
	`objectId` text,
	`objectType` text,
	`ownerId` text NOT NULL,
	`organizationId` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `LibraryItem` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`description` text,
	`category` text NOT NULL,
	`type` text NOT NULL,
	`data` text NOT NULL,
	`properties` text,
	`tags` text,
	`thumbnail` text,
	`isPublic` integer DEFAULT false NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`ownerId` text,
	`organizationId` text,
	CONSTRAINT `fk_LibraryItem_ownerId_User_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`),
	CONSTRAINT `fk_LibraryItem_organizationId_Organization_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`)
);
--> statement-breakpoint
CREATE TABLE `MCPServerConfig` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`type` text DEFAULT 'sse' NOT NULL,
	`url` text,
	`command` text,
	`args` text,
	`workingDirectory` text,
	`enabled` integer DEFAULT true NOT NULL,
	`userId` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `MachineConfig` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`description` text,
	`config` text NOT NULL,
	`isPublic` integer DEFAULT false NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`ownerId` text NOT NULL,
	CONSTRAINT `fk_MachineConfig_ownerId_User_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`)
);
--> statement-breakpoint
CREATE TABLE `MarketplaceCategory` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`slug` text NOT NULL UNIQUE,
	`description` text,
	`icon` text,
	`parentId` text,
	`sortOrder` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	CONSTRAINT `fk_MarketplaceCategory_parentId_MarketplaceCategory_id_fk` FOREIGN KEY (`parentId`) REFERENCES `MarketplaceCategory`(`id`)
);
--> statement-breakpoint
CREATE TABLE `MarketplaceCollectionItem` (
	`id` text PRIMARY KEY,
	`collectionId` text NOT NULL,
	`itemId` text NOT NULL,
	`sortOrder` integer DEFAULT 0 NOT NULL,
	`addedAt` integer NOT NULL,
	CONSTRAINT `fk_MarketplaceCollectionItem_collectionId_MarketplaceCollection_id_fk` FOREIGN KEY (`collectionId`) REFERENCES `MarketplaceCollection`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_MarketplaceCollectionItem_itemId_MarketplaceItem_id_fk` FOREIGN KEY (`itemId`) REFERENCES `MarketplaceItem`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `MarketplaceCollection` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`description` text,
	`slug` text NOT NULL UNIQUE,
	`thumbnailUrl` text,
	`sellerId` text NOT NULL,
	`featured` integer DEFAULT false NOT NULL,
	`itemCount` integer DEFAULT 0 NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	CONSTRAINT `fk_MarketplaceCollection_sellerId_MarketplaceSeller_id_fk` FOREIGN KEY (`sellerId`) REFERENCES `MarketplaceSeller`(`id`)
);
--> statement-breakpoint
CREATE TABLE `MarketplaceItem` (
	`id` text PRIMARY KEY,
	`title` text NOT NULL,
	`description` text,
	`shortDescription` text,
	`type` text NOT NULL,
	`price` real NOT NULL,
	`currencyCode` text DEFAULT 'USD' NOT NULL,
	`licenseType` text DEFAULT 'PERSONAL' NOT NULL,
	`tags` text,
	`category` text,
	`subcategory` text,
	`thumbnailUrl` text,
	`previewImages` text,
	`downloadUrl` text,
	`fileSize` integer,
	`downloadCount` integer DEFAULT 0 NOT NULL,
	`viewCount` integer DEFAULT 0 NOT NULL,
	`rating` real,
	`reviewCount` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`featured` integer DEFAULT false NOT NULL,
	`polarProductId` text UNIQUE,
	`sellerId` text NOT NULL,
	`originalItemId` text,
	`originalItemType` text,
	`metadata` text DEFAULT '{}' NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`approvedAt` integer,
	`approvedBy` text,
	CONSTRAINT `fk_MarketplaceItem_sellerId_MarketplaceSeller_id_fk` FOREIGN KEY (`sellerId`) REFERENCES `MarketplaceSeller`(`id`)
);
--> statement-breakpoint
CREATE TABLE `MarketplaceOrder` (
	`id` text PRIMARY KEY,
	`orderNumber` text NOT NULL UNIQUE,
	`buyerId` text NOT NULL,
	`sellerId` text NOT NULL,
	`itemId` text NOT NULL,
	`quantity` integer DEFAULT 1 NOT NULL,
	`unitPrice` real NOT NULL,
	`totalPrice` real NOT NULL,
	`commissionAmount` real NOT NULL,
	`sellerAmount` real NOT NULL,
	`currencyCode` text DEFAULT 'USD' NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`polarCheckoutId` text UNIQUE,
	`polarPaymentId` text,
	`downloadUrl` text,
	`downloadExpiresAt` integer,
	`downloadCount` integer DEFAULT 0 NOT NULL,
	`maxDownloads` integer DEFAULT 3,
	`licenseKey` text,
	`metadata` text DEFAULT '{}' NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`completedAt` integer,
	CONSTRAINT `fk_MarketplaceOrder_buyerId_User_id_fk` FOREIGN KEY (`buyerId`) REFERENCES `User`(`id`),
	CONSTRAINT `fk_MarketplaceOrder_sellerId_MarketplaceSeller_id_fk` FOREIGN KEY (`sellerId`) REFERENCES `MarketplaceSeller`(`id`),
	CONSTRAINT `fk_MarketplaceOrder_itemId_MarketplaceItem_id_fk` FOREIGN KEY (`itemId`) REFERENCES `MarketplaceItem`(`id`)
);
--> statement-breakpoint
CREATE TABLE `MarketplacePayout` (
	`id` text PRIMARY KEY,
	`sellerId` text NOT NULL,
	`amount` real NOT NULL,
	`currencyCode` text DEFAULT 'USD' NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`payoutMethod` text NOT NULL,
	`transactionId` text,
	`processedAt` integer,
	`failureReason` text,
	`metadata` text DEFAULT '{}' NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	CONSTRAINT `fk_MarketplacePayout_sellerId_MarketplaceSeller_id_fk` FOREIGN KEY (`sellerId`) REFERENCES `MarketplaceSeller`(`id`)
);
--> statement-breakpoint
CREATE TABLE `MarketplaceReview` (
	`id` text PRIMARY KEY,
	`itemId` text NOT NULL,
	`buyerId` text NOT NULL,
	`orderId` text NOT NULL UNIQUE,
	`rating` integer NOT NULL,
	`title` text,
	`comment` text,
	`helpful` integer DEFAULT 0 NOT NULL,
	`reported` integer DEFAULT false NOT NULL,
	`verified` integer DEFAULT true NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	CONSTRAINT `fk_MarketplaceReview_itemId_MarketplaceItem_id_fk` FOREIGN KEY (`itemId`) REFERENCES `MarketplaceItem`(`id`),
	CONSTRAINT `fk_MarketplaceReview_buyerId_User_id_fk` FOREIGN KEY (`buyerId`) REFERENCES `User`(`id`),
	CONSTRAINT `fk_MarketplaceReview_orderId_MarketplaceOrder_id_fk` FOREIGN KEY (`orderId`) REFERENCES `MarketplaceOrder`(`id`)
);
--> statement-breakpoint
CREATE TABLE `MarketplaceSeller` (
	`id` text PRIMARY KEY,
	`userId` text NOT NULL UNIQUE,
	`storeName` text NOT NULL,
	`storeDescription` text,
	`storeUrl` text UNIQUE,
	`avatar` text,
	`banner` text,
	`rating` real,
	`reviewCount` integer DEFAULT 0 NOT NULL,
	`totalSales` integer DEFAULT 0 NOT NULL,
	`totalRevenue` real DEFAULT 0 NOT NULL,
	`commissionRate` real DEFAULT 15 NOT NULL,
	`payoutEmail` text,
	`taxInfo` text DEFAULT '{}' NOT NULL,
	`verified` integer DEFAULT false NOT NULL,
	`suspended` integer DEFAULT false NOT NULL,
	`polarCustomerId` text UNIQUE,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	CONSTRAINT `fk_MarketplaceSeller_userId_User_id_fk` FOREIGN KEY (`userId`) REFERENCES `User`(`id`)
);
--> statement-breakpoint
CREATE TABLE `MarketplaceWishlist` (
	`id` text PRIMARY KEY,
	`userId` text NOT NULL,
	`itemId` text NOT NULL,
	`addedAt` integer NOT NULL,
	CONSTRAINT `fk_MarketplaceWishlist_userId_User_id_fk` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_MarketplaceWishlist_itemId_MarketplaceItem_id_fk` FOREIGN KEY (`itemId`) REFERENCES `MarketplaceItem`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `MaterialCost` (
	`id` text PRIMARY KEY,
	`materialId` text NOT NULL,
	`costPerUnit` real NOT NULL,
	`wasteFactor` real DEFAULT 0 NOT NULL,
	`minimumCharge` real DEFAULT 0 NOT NULL,
	`currencyCode` text DEFAULT 'EUR' NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`ownerId` text,
	`organizationId` text,
	CONSTRAINT `fk_MaterialCost_materialId_Material_id_fk` FOREIGN KEY (`materialId`) REFERENCES `Material`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_MaterialCost_ownerId_User_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`),
	CONSTRAINT `fk_MaterialCost_organizationId_Organization_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`)
);
--> statement-breakpoint
CREATE TABLE `Material` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`description` text,
	`properties` text NOT NULL,
	`isPublic` integer DEFAULT false NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`ownerId` text,
	`organizationId` text,
	CONSTRAINT `fk_Material_ownerId_User_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`),
	CONSTRAINT `fk_Material_organizationId_Organization_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`)
);
--> statement-breakpoint
CREATE TABLE `Message` (
	`id` text PRIMARY KEY,
	`content` text NOT NULL,
	`senderId` text NOT NULL,
	`conversationId` text NOT NULL,
	`fileId` text,
	`fileUrl` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	CONSTRAINT `fk_Message_senderId_User_id_fk` FOREIGN KEY (`senderId`) REFERENCES `User`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_Message_conversationId_Conversation_id_fk` FOREIGN KEY (`conversationId`) REFERENCES `Conversation`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_Message_fileId_FileUpload_id_fk` FOREIGN KEY (`fileId`) REFERENCES `FileUpload`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `Notification` (
	`id` text PRIMARY KEY,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`isRead` integer DEFAULT false NOT NULL,
	`createdAt` integer NOT NULL,
	`userId` text NOT NULL,
	`organizationId` text,
	`projectId` text,
	`componentId` text,
	`messageId` text,
	`linkUrl` text,
	CONSTRAINT `fk_Notification_userId_User_id_fk` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_Notification_organizationId_Organization_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_Notification_projectId_Project_id_fk` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_Notification_componentId_Component_id_fk` FOREIGN KEY (`componentId`) REFERENCES `Component`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_Notification_messageId_Message_id_fk` FOREIGN KEY (`messageId`) REFERENCES `Message`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `OperationCost` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`machineHourlyRate` real NOT NULL,
	`operatorHourlyRate` real NOT NULL,
	`setupTime` real DEFAULT 30 NOT NULL,
	`currencyCode` text DEFAULT 'EUR' NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`ownerId` text NOT NULL,
	`organizationId` text,
	CONSTRAINT `fk_OperationCost_ownerId_User_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`),
	CONSTRAINT `fk_OperationCost_organizationId_Organization_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`)
);
--> statement-breakpoint
CREATE TABLE `OrganizationInvitation` (
	`id` text PRIMARY KEY,
	`email` text NOT NULL,
	`role` text DEFAULT 'MEMBER' NOT NULL,
	`token` text NOT NULL UNIQUE,
	`organizationId` text NOT NULL,
	`createdAt` integer NOT NULL,
	`expiresAt` integer NOT NULL,
	CONSTRAINT `fk_OrganizationInvitation_organizationId_Organization_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `Organization` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`description` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `passkey` (
	`id` text PRIMARY KEY,
	`name` text,
	`publicKey` text NOT NULL,
	`userId` text NOT NULL,
	`credentialID` text NOT NULL UNIQUE,
	`counter` integer NOT NULL,
	`deviceType` text NOT NULL,
	`backedUp` integer NOT NULL,
	`transports` text,
	`aaguid` text,
	`createdAt` integer NOT NULL,
	CONSTRAINT `fk_passkey_userId_User_id_fk` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `PluginConfiguration` (
	`pluginId` text PRIMARY KEY,
	`configJson` text NOT NULL,
	CONSTRAINT `fk_PluginConfiguration_pluginId_PluginRegistryEntry_id_fk` FOREIGN KEY (`pluginId`) REFERENCES `PluginRegistryEntry`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `PluginRegistryEntry` (
	`id` text PRIMARY KEY,
	`manifestJson` text NOT NULL,
	`state` text NOT NULL,
	`enabled` integer NOT NULL,
	`version` text NOT NULL,
	`installedAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`errorCount` integer DEFAULT 0 NOT NULL,
	`lastError` text
);
--> statement-breakpoint
CREATE TABLE `ProductionCostEstimate` (
	`id` text PRIMARY KEY,
	`toolpathId` text NOT NULL,
	`materialCost` real NOT NULL,
	`toolWearCost` real NOT NULL,
	`machineTime` real NOT NULL,
	`machineTimeCost` real NOT NULL,
	`operatorTime` real NOT NULL,
	`operatorTimeCost` real NOT NULL,
	`setupCost` real NOT NULL,
	`totalCost` real NOT NULL,
	`currencyCode` text DEFAULT 'EUR' NOT NULL,
	`details` text DEFAULT '{}' NOT NULL,
	`operationCostId` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`ownerId` text NOT NULL,
	`organizationId` text,
	CONSTRAINT `fk_ProductionCostEstimate_toolpathId_Toolpath_id_fk` FOREIGN KEY (`toolpathId`) REFERENCES `Toolpath`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_ProductionCostEstimate_operationCostId_OperationCost_id_fk` FOREIGN KEY (`operationCostId`) REFERENCES `OperationCost`(`id`),
	CONSTRAINT `fk_ProductionCostEstimate_ownerId_User_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`),
	CONSTRAINT `fk_ProductionCostEstimate_organizationId_Organization_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`)
);
--> statement-breakpoint
CREATE TABLE `Project` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`description` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`ownerId` text NOT NULL,
	`organizationId` text,
	`isPublic` integer DEFAULT false NOT NULL,
	CONSTRAINT `fk_Project_ownerId_User_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`),
	CONSTRAINT `fk_Project_organizationId_Organization_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`)
);
--> statement-breakpoint
CREATE TABLE `PushSubscription` (
	`id` text PRIMARY KEY,
	`userId` text NOT NULL,
	`endpoint` text NOT NULL UNIQUE,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`createdAt` integer NOT NULL,
	CONSTRAINT `fk_PushSubscription_userId_User_id_fk` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `Session` (
	`id` text PRIMARY KEY,
	`token` text NOT NULL UNIQUE,
	`userId` text NOT NULL,
	`expiresAt` integer NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`ipAddress` text,
	`userAgent` text,
	CONSTRAINT `fk_Session_userId_User_id_fk` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `Subscription` (
	`id` text PRIMARY KEY,
	`plan` text NOT NULL,
	`referenceId` text NOT NULL,
	`stripeCustomerId` text,
	`stripeSubscriptionId` text,
	`status` text DEFAULT 'active' NOT NULL,
	`periodStart` integer,
	`periodEnd` integer,
	`cancelAtPeriodEnd` integer DEFAULT false,
	`seats` integer,
	`groupId` text,
	`priceId` text,
	`trialStart` integer,
	`trialEnd` integer,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`stripePriceId` text,
	`stripeCurrentPeriodStart` integer,
	`stripeCurrentPeriodEnd` integer,
	`lsCustomerId` text,
	`lsSubscriptionId` text,
	`lsVariantId` text,
	`lsCurrentPeriodEnd` integer,
	`trialEndsAt` integer,
	CONSTRAINT `fk_Subscription_referenceId_User_id_fk` FOREIGN KEY (`referenceId`) REFERENCES `User`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `Token` (
	`id` text PRIMARY KEY,
	`token` text NOT NULL,
	`type` text NOT NULL,
	`expiresAt` integer NOT NULL,
	`userId` text NOT NULL,
	`metadata` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	CONSTRAINT `fk_Token_userId_User_id_fk` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `Tool` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`diameter` real NOT NULL,
	`material` text NOT NULL,
	`numberOfFlutes` integer,
	`maxRPM` integer,
	`coolantType` text,
	`cuttingLength` real,
	`totalLength` real,
	`shankDiameter` real,
	`notes` text,
	`isPublic` integer DEFAULT false NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`ownerId` text,
	`organizationId` text,
	CONSTRAINT `fk_Tool_ownerId_User_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`),
	CONSTRAINT `fk_Tool_organizationId_Organization_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`)
);
--> statement-breakpoint
CREATE TABLE `ToolWearCost` (
	`id` text PRIMARY KEY,
	`toolId` text NOT NULL,
	`wearRatePerMeter` real NOT NULL,
	`replacementCost` real NOT NULL,
	`replacementThreshold` real DEFAULT 100 NOT NULL,
	`currencyCode` text DEFAULT 'EUR' NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`ownerId` text,
	`organizationId` text,
	CONSTRAINT `fk_ToolWearCost_toolId_Tool_id_fk` FOREIGN KEY (`toolId`) REFERENCES `Tool`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_ToolWearCost_ownerId_User_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`),
	CONSTRAINT `fk_ToolWearCost_organizationId_Organization_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`)
);
--> statement-breakpoint
CREATE TABLE `ToolpathComment` (
	`id` text PRIMARY KEY,
	`toolpathId` text NOT NULL,
	`content` text NOT NULL,
	`userId` text NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	CONSTRAINT `fk_ToolpathComment_toolpathId_Toolpath_id_fk` FOREIGN KEY (`toolpathId`) REFERENCES `Toolpath`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_ToolpathComment_userId_User_id_fk` FOREIGN KEY (`userId`) REFERENCES `User`(`id`)
);
--> statement-breakpoint
CREATE TABLE `Toolpath` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`description` text,
	`data` text,
	`type` text,
	`operationType` text,
	`gcode` text,
	`thumbnail` text,
	`isPublic` integer DEFAULT false NOT NULL,
	`projectId` text NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`createdBy` text NOT NULL,
	`drawingId` text,
	`materialId` text,
	`toolId` text,
	`machineConfigId` text,
	CONSTRAINT `fk_Toolpath_projectId_Project_id_fk` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_Toolpath_createdBy_User_id_fk` FOREIGN KEY (`createdBy`) REFERENCES `User`(`id`),
	CONSTRAINT `fk_Toolpath_drawingId_Drawing_id_fk` FOREIGN KEY (`drawingId`) REFERENCES `Drawing`(`id`),
	CONSTRAINT `fk_Toolpath_materialId_Material_id_fk` FOREIGN KEY (`materialId`) REFERENCES `Material`(`id`),
	CONSTRAINT `fk_Toolpath_toolId_Tool_id_fk` FOREIGN KEY (`toolId`) REFERENCES `Tool`(`id`),
	CONSTRAINT `fk_Toolpath_machineConfigId_MachineConfig_id_fk` FOREIGN KEY (`machineConfigId`) REFERENCES `MachineConfig`(`id`)
);
--> statement-breakpoint
CREATE TABLE `ToolpathVersion` (
	`id` text PRIMARY KEY,
	`toolpathId` text NOT NULL,
	`data` text,
	`gcode` text,
	`changeMessage` text,
	`userId` text NOT NULL,
	`createdAt` integer NOT NULL,
	CONSTRAINT `fk_ToolpathVersion_toolpathId_Toolpath_id_fk` FOREIGN KEY (`toolpathId`) REFERENCES `Toolpath`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_ToolpathVersion_userId_User_id_fk` FOREIGN KEY (`userId`) REFERENCES `User`(`id`)
);
--> statement-breakpoint
CREATE TABLE `twoFactor` (
	`id` text PRIMARY KEY,
	`userId` text NOT NULL UNIQUE,
	`secret` text NOT NULL,
	`backupCodes` text NOT NULL,
	CONSTRAINT `fk_twoFactor_userId_User_id_fk` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `UserOrganization` (
	`id` text PRIMARY KEY,
	`userId` text NOT NULL,
	`organizationId` text NOT NULL,
	`role` text DEFAULT 'MEMBER' NOT NULL,
	`joinedAt` integer NOT NULL,
	CONSTRAINT `fk_UserOrganization_userId_User_id_fk` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_UserOrganization_organizationId_Organization_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `Organization`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `User` (
	`id` text PRIMARY KEY,
	`name` text,
	`email` text UNIQUE,
	`emailVerified` integer,
	`image` text,
	`password` text,
	`bio` text,
	`location` text,
	`website` text,
	`company` text,
	`title` text,
	`publicProfile` integer DEFAULT true NOT NULL,
	`showEmail` integer DEFAULT false NOT NULL,
	`twoFactorEnabled` integer DEFAULT false NOT NULL,
	`stripeCustomerId` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `verification_tokens` (
	`identifier` text NOT NULL,
	`token` text NOT NULL UNIQUE,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `Account_providerId_accountId_key` ON `Account` (`providerId`,`accountId`);--> statement-breakpoint
CREATE INDEX `ApiKey_userId_idx` ON `ApiKey` (`userId`);--> statement-breakpoint
CREATE UNIQUE INDEX `ConversationParticipant_userId_conversationId_key` ON `ConversationParticipant` (`userId`,`conversationId`);--> statement-breakpoint
CREATE INDEX `MCPServerConfig_userId_idx` ON `MCPServerConfig` (`userId`);--> statement-breakpoint
CREATE INDEX `MarketplaceCategory_parentId_idx` ON `MarketplaceCategory` (`parentId`);--> statement-breakpoint
CREATE UNIQUE INDEX `MarketplaceCollectionItem_collectionId_itemId_key` ON `MarketplaceCollectionItem` (`collectionId`,`itemId`);--> statement-breakpoint
CREATE INDEX `MarketplaceCollection_sellerId_idx` ON `MarketplaceCollection` (`sellerId`);--> statement-breakpoint
CREATE INDEX `MarketplaceItem_sellerId_idx` ON `MarketplaceItem` (`sellerId`);--> statement-breakpoint
CREATE INDEX `MarketplaceItem_type_idx` ON `MarketplaceItem` (`type`);--> statement-breakpoint
CREATE INDEX `MarketplaceItem_status_idx` ON `MarketplaceItem` (`status`);--> statement-breakpoint
CREATE INDEX `MarketplaceItem_category_idx` ON `MarketplaceItem` (`category`);--> statement-breakpoint
CREATE INDEX `MarketplaceItem_featured_idx` ON `MarketplaceItem` (`featured`);--> statement-breakpoint
CREATE INDEX `MarketplaceOrder_buyerId_idx` ON `MarketplaceOrder` (`buyerId`);--> statement-breakpoint
CREATE INDEX `MarketplaceOrder_sellerId_idx` ON `MarketplaceOrder` (`sellerId`);--> statement-breakpoint
CREATE INDEX `MarketplaceOrder_itemId_idx` ON `MarketplaceOrder` (`itemId`);--> statement-breakpoint
CREATE INDEX `MarketplaceOrder_status_idx` ON `MarketplaceOrder` (`status`);--> statement-breakpoint
CREATE INDEX `MarketplacePayout_sellerId_idx` ON `MarketplacePayout` (`sellerId`);--> statement-breakpoint
CREATE INDEX `MarketplaceReview_itemId_idx` ON `MarketplaceReview` (`itemId`);--> statement-breakpoint
CREATE INDEX `MarketplaceReview_buyerId_idx` ON `MarketplaceReview` (`buyerId`);--> statement-breakpoint
CREATE UNIQUE INDEX `MarketplaceWishlist_userId_itemId_key` ON `MarketplaceWishlist` (`userId`,`itemId`);--> statement-breakpoint
CREATE INDEX `Message_conversationId_idx` ON `Message` (`conversationId`);--> statement-breakpoint
CREATE INDEX `Subscription_referenceId_idx` ON `Subscription` (`referenceId`);--> statement-breakpoint
CREATE INDEX `Subscription_stripeCustomerId_idx` ON `Subscription` (`stripeCustomerId`);--> statement-breakpoint
CREATE INDEX `Subscription_stripeSubscriptionId_idx` ON `Subscription` (`stripeSubscriptionId`);--> statement-breakpoint
CREATE INDEX `Token_userId_idx` ON `Token` (`userId`);--> statement-breakpoint
CREATE INDEX `Token_token_idx` ON `Token` (`token`);--> statement-breakpoint
CREATE UNIQUE INDEX `UserOrganization_userId_organizationId_key` ON `UserOrganization` (`userId`,`organizationId`);--> statement-breakpoint
CREATE UNIQUE INDEX `verification_tokens_identifier_token_key` ON `verification_tokens` (`identifier`,`token`);
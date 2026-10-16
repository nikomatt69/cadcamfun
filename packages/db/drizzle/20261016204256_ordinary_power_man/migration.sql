DROP INDEX IF EXISTS `MarketplaceCategory_parentId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `MarketplaceCollectionItem_collectionId_itemId_key`;--> statement-breakpoint
DROP INDEX IF EXISTS `MarketplaceCollection_sellerId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `MarketplaceItem_sellerId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `MarketplaceItem_type_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `MarketplaceItem_status_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `MarketplaceItem_category_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `MarketplaceItem_featured_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `MarketplaceOrder_buyerId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `MarketplaceOrder_sellerId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `MarketplaceOrder_itemId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `MarketplaceOrder_status_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `MarketplacePayout_sellerId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `MarketplaceReview_itemId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `MarketplaceReview_buyerId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `MarketplaceWishlist_userId_itemId_key`;--> statement-breakpoint
DROP TABLE `MarketplaceCategory`;--> statement-breakpoint
DROP TABLE `MarketplaceCollectionItem`;--> statement-breakpoint
DROP TABLE `MarketplaceCollection`;--> statement-breakpoint
DROP TABLE `MarketplaceItem`;--> statement-breakpoint
DROP TABLE `MarketplaceOrder`;--> statement-breakpoint
DROP TABLE `MarketplacePayout`;--> statement-breakpoint
DROP TABLE `MarketplaceReview`;--> statement-breakpoint
DROP TABLE `MarketplaceSeller`;--> statement-breakpoint
DROP TABLE `MarketplaceWishlist`;
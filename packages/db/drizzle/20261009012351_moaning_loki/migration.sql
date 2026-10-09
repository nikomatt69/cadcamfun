CREATE TABLE `CadOperationLog` (
	`id` text PRIMARY KEY,
	`projectId` text NOT NULL,
	`operation` text NOT NULL,
	`meshAssetId` text,
	`outcome` text NOT NULL,
	`durationMs` real NOT NULL,
	`inputs` text NOT NULL,
	`error` text,
	`traceId` text,
	`spanId` text,
	`createdAt` integer NOT NULL,
	CONSTRAINT `fk_CadOperationLog_projectId_Project_id_fk` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_CadOperationLog_meshAssetId_MeshAsset_id_fk` FOREIGN KEY (`meshAssetId`) REFERENCES `MeshAsset`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `MeshAsset` (
	`id` text PRIMARY KEY,
	`projectId` text NOT NULL,
	`kind` text NOT NULL,
	`inputs` text NOT NULL,
	`stats` text NOT NULL,
	`mesh` text NOT NULL,
	`createdAt` integer NOT NULL,
	CONSTRAINT `fk_MeshAsset_projectId_Project_id_fk` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `CadOperationLog_projectId_idx` ON `CadOperationLog` (`projectId`);--> statement-breakpoint
CREATE INDEX `MeshAsset_projectId_kind_idx` ON `MeshAsset` (`projectId`,`kind`);
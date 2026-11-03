CREATE TABLE `LibraryRowVersion` (
	`id` text PRIMARY KEY,
	`kind` text NOT NULL,
	`rowId` text NOT NULL,
	`version` integer NOT NULL,
	`data` text NOT NULL,
	`changedBy` text,
	`createdAt` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `MachineConfig` ADD `version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `Material` ADD `version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `Tool` ADD `version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE INDEX `LibraryRowVersion_kind_rowId_idx` ON `LibraryRowVersion` (`kind`,`rowId`);
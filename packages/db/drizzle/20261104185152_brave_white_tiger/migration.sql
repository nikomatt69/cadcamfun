CREATE TABLE `ProbeReport` (
	`id` text PRIMARY KEY,
	`projectId` text NOT NULL,
	`drawingId` text,
	`toolpathId` text,
	`machineConfigId` text,
	`setupId` text,
	`runId` text,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`source` text NOT NULL,
	`verdict` text NOT NULL,
	`workOffset` text,
	`programHash` text,
	`sourceRevision` text,
	`data` text NOT NULL,
	`measuredAt` integer NOT NULL,
	`createdAt` integer NOT NULL,
	`createdById` text NOT NULL,
	CONSTRAINT `fk_ProbeReport_projectId_Project_id_fk` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_ProbeReport_drawingId_Drawing_id_fk` FOREIGN KEY (`drawingId`) REFERENCES `Drawing`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_ProbeReport_toolpathId_Toolpath_id_fk` FOREIGN KEY (`toolpathId`) REFERENCES `Toolpath`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_ProbeReport_machineConfigId_MachineConfig_id_fk` FOREIGN KEY (`machineConfigId`) REFERENCES `MachineConfig`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_ProbeReport_createdById_User_id_fk` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`)
);
--> statement-breakpoint
CREATE INDEX `ProbeReport_project_created_idx` ON `ProbeReport` (`projectId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `ProbeReport_toolpath_idx` ON `ProbeReport` (`toolpathId`);
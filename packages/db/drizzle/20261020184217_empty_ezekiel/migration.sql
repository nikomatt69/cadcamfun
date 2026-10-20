PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_Toolpath` (
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
	CONSTRAINT `fk_Toolpath_drawingId_Drawing_id_fk` FOREIGN KEY (`drawingId`) REFERENCES `Drawing`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_Toolpath_materialId_Material_id_fk` FOREIGN KEY (`materialId`) REFERENCES `Material`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_Toolpath_toolId_Tool_id_fk` FOREIGN KEY (`toolId`) REFERENCES `Tool`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_Toolpath_machineConfigId_MachineConfig_id_fk` FOREIGN KEY (`machineConfigId`) REFERENCES `MachineConfig`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
INSERT INTO `__new_Toolpath`(`id`, `name`, `description`, `data`, `type`, `operationType`, `gcode`, `thumbnail`, `isPublic`, `projectId`, `createdAt`, `updatedAt`, `createdBy`, `drawingId`, `materialId`, `toolId`, `machineConfigId`) SELECT `id`, `name`, `description`, `data`, `type`, `operationType`, `gcode`, `thumbnail`, `isPublic`, `projectId`, `createdAt`, `updatedAt`, `createdBy`, `drawingId`, `materialId`, `toolId`, `machineConfigId` FROM `Toolpath`;--> statement-breakpoint
DROP TABLE `Toolpath`;--> statement-breakpoint
ALTER TABLE `__new_Toolpath` RENAME TO `Toolpath`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
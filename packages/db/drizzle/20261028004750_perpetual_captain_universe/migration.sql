CREATE TABLE `AiCommand` (
	`id` text PRIMARY KEY,
	`actorId` text NOT NULL,
	`projectId` text NOT NULL,
	`drawingId` text,
	`sessionId` text NOT NULL,
	`callId` text NOT NULL,
	`messageId` text,
	`actionId` text NOT NULL,
	`inputDigest` text NOT NULL,
	`status` text NOT NULL,
	`outcome` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	CONSTRAINT `fk_AiCommand_actorId_User_id_fk` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_AiCommand_projectId_Project_id_fk` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `AiMutationReceipt` (
	`id` text PRIMARY KEY,
	`commandId` text NOT NULL,
	`sequence` integer NOT NULL,
	`operation` text NOT NULL,
	`resourceId` text,
	`previousRevision` text,
	`revision` text,
	`result` text NOT NULL,
	`committedAt` integer NOT NULL,
	CONSTRAINT `fk_AiMutationReceipt_commandId_AiCommand_id_fk` FOREIGN KEY (`commandId`) REFERENCES `AiCommand`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `AiCommand_owner_idx` ON `AiCommand` (`actorId`,`projectId`,`sessionId`);--> statement-breakpoint
CREATE UNIQUE INDEX `AiMutationReceipt_command_sequence_key` ON `AiMutationReceipt` (`commandId`,`sequence`);
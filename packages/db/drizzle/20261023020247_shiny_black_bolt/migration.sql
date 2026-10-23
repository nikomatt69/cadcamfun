CREATE TABLE `CompanionDevice` (
	`id` text PRIMARY KEY,
	`userId` text NOT NULL,
	`name` text NOT NULL,
	`hash` text NOT NULL,
	`createdAt` integer NOT NULL,
	`lastSeenAt` integer,
	`expiresAt` integer,
	CONSTRAINT `fk_CompanionDevice_userId_User_id_fk` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `CompanionPairingCode` (
	`id` text PRIMARY KEY,
	`userId` text NOT NULL,
	`name` text NOT NULL,
	`codeHash` text NOT NULL,
	`expiresAt` integer NOT NULL,
	`consumedAt` integer,
	`deviceId` text,
	`createdAt` integer NOT NULL,
	CONSTRAINT `fk_CompanionPairingCode_userId_User_id_fk` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_CompanionPairingCode_deviceId_CompanionDevice_id_fk` FOREIGN KEY (`deviceId`) REFERENCES `CompanionDevice`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `CompanionDevice_hash_key` ON `CompanionDevice` (`hash`);--> statement-breakpoint
CREATE INDEX `CompanionDevice_userId_idx` ON `CompanionDevice` (`userId`);--> statement-breakpoint
CREATE UNIQUE INDEX `CompanionPairingCode_codeHash_key` ON `CompanionPairingCode` (`codeHash`);
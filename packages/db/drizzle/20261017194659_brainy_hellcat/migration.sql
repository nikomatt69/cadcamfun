CREATE TABLE `GitProfile` (
	`userId` text PRIMARY KEY,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	CONSTRAINT `fk_GitProfile_userId_User_id_fk` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE
);

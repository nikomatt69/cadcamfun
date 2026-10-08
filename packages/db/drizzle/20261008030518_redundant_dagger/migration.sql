CREATE TABLE `GitObject` (
	`projectId` text NOT NULL,
	`oid` text NOT NULL,
	`type` text NOT NULL,
	`body` blob NOT NULL,
	CONSTRAINT `fk_GitObject_projectId_Project_id_fk` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `GitRef` (
	`projectId` text NOT NULL,
	`name` text NOT NULL,
	`oid` text NOT NULL,
	CONSTRAINT `fk_GitRef_projectId_Project_id_fk` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `GitRepo` (
	`projectId` text PRIMARY KEY,
	`head` text DEFAULT 'refs/heads/main' NOT NULL,
	`remote` text,
	`createdAt` integer NOT NULL,
	CONSTRAINT `fk_GitRepo_projectId_Project_id_fk` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `PullRequestReview` (
	`id` text PRIMARY KEY,
	`pullRequestId` text NOT NULL,
	`reviewerId` text NOT NULL,
	`verdict` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`path` text,
	`pointer` text,
	`createdAt` integer NOT NULL,
	CONSTRAINT `fk_PullRequestReview_pullRequestId_PullRequest_id_fk` FOREIGN KEY (`pullRequestId`) REFERENCES `PullRequest`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_PullRequestReview_reviewerId_User_id_fk` FOREIGN KEY (`reviewerId`) REFERENCES `User`(`id`)
);
--> statement-breakpoint
CREATE TABLE `PullRequest` (
	`id` text PRIMARY KEY,
	`projectId` text NOT NULL,
	`number` integer NOT NULL,
	`title` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`head` text NOT NULL,
	`base` text NOT NULL,
	`state` text DEFAULT 'open' NOT NULL,
	`authorId` text NOT NULL,
	`authorKind` text DEFAULT 'user' NOT NULL,
	`mergeCommit` text,
	`remoteNumber` integer,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	CONSTRAINT `fk_PullRequest_projectId_Project_id_fk` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_PullRequest_authorId_User_id_fk` FOREIGN KEY (`authorId`) REFERENCES `User`(`id`)
);
--> statement-breakpoint
CREATE TABLE `WorkflowRun` (
	`id` text PRIMARY KEY,
	`projectId` text NOT NULL,
	`workflow` text NOT NULL,
	`event` text NOT NULL,
	`ref` text NOT NULL,
	`sha` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`events` text NOT NULL,
	`startedAt` integer NOT NULL,
	`finishedAt` integer,
	CONSTRAINT `fk_WorkflowRun_projectId_Project_id_fk` FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX `GitObject_projectId_oid_key` ON `GitObject` (`projectId`,`oid`);--> statement-breakpoint
CREATE UNIQUE INDEX `GitRef_projectId_name_key` ON `GitRef` (`projectId`,`name`);--> statement-breakpoint
CREATE INDEX `PullRequestReview_pullRequestId_idx` ON `PullRequestReview` (`pullRequestId`);--> statement-breakpoint
CREATE UNIQUE INDEX `PullRequest_projectId_number_key` ON `PullRequest` (`projectId`,`number`);--> statement-breakpoint
CREATE INDEX `WorkflowRun_projectId_idx` ON `WorkflowRun` (`projectId`);
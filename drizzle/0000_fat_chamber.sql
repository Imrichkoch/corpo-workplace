CREATE TABLE `bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`resource` text NOT NULL,
	`date` text NOT NULL,
	`start` text NOT NULL,
	`end` text NOT NULL,
	`title` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `booking_resource_date` ON `bookings` (`resource`,`date`);--> statement-breakpoint
CREATE TABLE `visits` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`company` text NOT NULL,
	`date` text NOT NULL,
	`time` text NOT NULL,
	`office` text NOT NULL,
	`status` text DEFAULT 'expected' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `visit_owner` ON `visits` (`owner`);
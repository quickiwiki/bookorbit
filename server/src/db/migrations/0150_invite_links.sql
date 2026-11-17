CREATE TABLE "invite_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(32) NOT NULL,
	"label" varchar(100) DEFAULT '' NOT NULL,
	"max_uses" integer,
	"use_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "invite_links_code_unique" UNIQUE("code"),
	CONSTRAINT "invite_links_use_count_nonneg_chk" CHECK ("invite_links"."use_count" >= 0),
	CONSTRAINT "invite_links_max_uses_positive_chk" CHECK ("invite_links"."max_uses" is null or "invite_links"."max_uses" > 0)
);
--> statement-breakpoint
ALTER TABLE "invite_links" ADD CONSTRAINT "invite_links_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
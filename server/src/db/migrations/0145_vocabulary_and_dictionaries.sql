CREATE TABLE "dictionary_entries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"source_id" integer NOT NULL,
	"headword" varchar(500) NOT NULL,
	"normalized_headword" varchar(500) NOT NULL,
	"body" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dictionary_sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"kind" varchar(20) NOT NULL,
	"name" varchar(200) NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"source_lang" varchar(16),
	"target_lang" varchar(16),
	"status" varchar(20) DEFAULT 'ready' NOT NULL,
	"entry_count" integer DEFAULT 0 NOT NULL,
	"error" varchar(500),
	"oxford_environment" varchar(20),
	"encrypted_credentials" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dictionary_sources_kind_chk" CHECK ("dictionary_sources"."kind" in ('oxford', 'dsl')),
	CONSTRAINT "dictionary_sources_status_chk" CHECK ("dictionary_sources"."status" in ('ready', 'importing', 'failed')),
	CONSTRAINT "dictionary_sources_oxford_env_chk" CHECK ("dictionary_sources"."oxford_environment" is null or "dictionary_sources"."oxford_environment" in ('sandbox', 'production'))
);
--> statement-breakpoint
CREATE TABLE "vocabulary_lists" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" varchar(120) NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vocabulary_words" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"list_id" integer NOT NULL,
	"word" varchar(200) NOT NULL,
	"normalized_word" varchar(200) NOT NULL,
	"definition" text,
	"context" text,
	"book_id" integer,
	"book_file_id" integer,
	"book_format" varchar(20),
	"book_title" varchar(500),
	"cfi" varchar(2000),
	"pageno" integer,
	"learned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dictionary_entries" ADD CONSTRAINT "dictionary_entries_source_id_dictionary_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."dictionary_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dictionary_sources" ADD CONSTRAINT "dictionary_sources_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_lists" ADD CONSTRAINT "vocabulary_lists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_words" ADD CONSTRAINT "vocabulary_words_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_words" ADD CONSTRAINT "vocabulary_words_list_id_vocabulary_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."vocabulary_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_words" ADD CONSTRAINT "vocabulary_words_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_words" ADD CONSTRAINT "vocabulary_words_book_file_id_book_files_id_fk" FOREIGN KEY ("book_file_id") REFERENCES "public"."book_files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dictionary_entries_source_headword_idx" ON "dictionary_entries" USING btree ("source_id","normalized_headword");--> statement-breakpoint
CREATE INDEX "dictionary_sources_user_idx" ON "dictionary_sources" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vocabulary_lists_user_name_uidx" ON "vocabulary_lists" USING btree ("user_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "vocabulary_lists_user_default_uidx" ON "vocabulary_lists" USING btree ("user_id") WHERE "vocabulary_lists"."is_default";--> statement-breakpoint
CREATE UNIQUE INDEX "vocabulary_words_list_normalized_uidx" ON "vocabulary_words" USING btree ("list_id","normalized_word");--> statement-breakpoint
CREATE INDEX "vocabulary_words_user_list_created_idx" ON "vocabulary_words" USING btree ("user_id","list_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "vocabulary_words_normalized_trgm_idx" ON "vocabulary_words" USING gin ("normalized_word" gin_trgm_ops);
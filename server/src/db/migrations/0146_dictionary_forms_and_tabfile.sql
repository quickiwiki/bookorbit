CREATE TABLE "dictionary_forms" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"source_id" integer NOT NULL,
	"entry_id" bigint NOT NULL,
	"normalized_form" varchar(500) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dictionary_sources" DROP CONSTRAINT "dictionary_sources_kind_chk";--> statement-breakpoint
DROP INDEX "dictionary_entries_source_headword_idx";--> statement-breakpoint
ALTER TABLE "dictionary_forms" ADD CONSTRAINT "dictionary_forms_source_id_dictionary_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."dictionary_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dictionary_forms" ADD CONSTRAINT "dictionary_forms_entry_id_dictionary_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."dictionary_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dictionary_forms_source_form_idx" ON "dictionary_forms" USING btree ("source_id","normalized_form");--> statement-breakpoint
CREATE INDEX "dictionary_forms_entry_idx" ON "dictionary_forms" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "dictionary_entries_source_idx" ON "dictionary_entries" USING btree ("source_id");--> statement-breakpoint
ALTER TABLE "dictionary_entries" DROP COLUMN "normalized_headword";--> statement-breakpoint
ALTER TABLE "dictionary_sources" ADD CONSTRAINT "dictionary_sources_kind_chk" CHECK ("dictionary_sources"."kind" in ('oxford', 'dsl', 'tabfile'));
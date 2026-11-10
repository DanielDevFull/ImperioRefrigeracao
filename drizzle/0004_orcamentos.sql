CREATE TYPE "public"."quote_item_kind" AS ENUM('servico', 'material');--> statement-breakpoint
CREATE TYPE "public"."quote_status" AS ENUM('rascunho', 'enviado', 'aprovado', 'recusado', 'cancelado');--> statement-breakpoint
ALTER TYPE "public"."work_order_origin" ADD VALUE 'orcamento';--> statement-breakpoint
CREATE TABLE "quote_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"kind" "quote_item_kind" NOT NULL,
	"product_id" uuid,
	"description" text NOT NULL,
	"quantity" numeric(12, 3) NOT NULL,
	"unit" text DEFAULT 'un' NOT NULL,
	"unit_price" numeric(12, 2) DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" integer GENERATED ALWAYS AS IDENTITY (sequence name "quotes_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"status" "quote_status" DEFAULT 'rascunho' NOT NULL,
	"customer_id" uuid,
	"contact_name" text NOT NULL,
	"contact_person_type" "person_type" DEFAULT 'pf' NOT NULL,
	"contact_document" text,
	"contact_phone" text,
	"contact_email" text,
	"zip" text,
	"street" text,
	"address_number" text,
	"complement" text,
	"district" text,
	"city" text,
	"state" text,
	"work_type" "work_order_type" DEFAULT 'corretiva' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"discount" numeric(12, 2) DEFAULT 0 NOT NULL,
	"total" numeric(12, 2) DEFAULT 0 NOT NULL,
	"valid_until" date NOT NULL,
	"terms" text,
	"public_token" text NOT NULL,
	"sent_at" timestamp with time zone,
	"viewed_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"decided_via" text,
	"decided_by_name" text,
	"decided_by_id" text,
	"rejection_reason" text,
	"work_order_id" uuid,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "quote_validity_days" integer DEFAULT 15 NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "quote_terms" text;--> statement-breakpoint
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_decided_by_id_user_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quote_items_quote_idx" ON "quote_items" USING btree ("quote_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quotes_number_uq" ON "quotes" USING btree ("number");--> statement-breakpoint
CREATE UNIQUE INDEX "quotes_public_token_uq" ON "quotes" USING btree ("public_token");--> statement-breakpoint
CREATE INDEX "quotes_status_idx" ON "quotes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "quotes_customer_idx" ON "quotes" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quotes_work_order_uq" ON "quotes" USING btree ("work_order_id");
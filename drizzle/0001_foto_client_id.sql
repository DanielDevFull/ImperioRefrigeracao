ALTER TABLE "work_order_photos" ADD COLUMN "client_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "work_order_photos_client_id_uq" ON "work_order_photos" USING btree ("client_id");
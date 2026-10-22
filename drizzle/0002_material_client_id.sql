ALTER TABLE "work_order_materials" ADD COLUMN "client_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "work_order_materials_client_id_uq" ON "work_order_materials" USING btree ("client_id");
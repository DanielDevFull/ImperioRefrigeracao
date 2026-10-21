CREATE TYPE "public"."commission_basis" AS ENUM('percentual_mao_de_obra', 'percentual_total', 'percentual_materiais', 'fixo_por_om');--> statement-breakpoint
CREATE TYPE "public"."commission_status" AS ENUM('pendente', 'aprovada', 'paga', 'cancelada');--> statement-breakpoint
CREATE TYPE "public"."contract_status" AS ENUM('ativo', 'suspenso', 'cancelado', 'encerrado');--> statement-breakpoint
CREATE TYPE "public"."customer_status" AS ENUM('ativo', 'inativo');--> statement-breakpoint
CREATE TYPE "public"."equipment_status" AS ENUM('ativo', 'inativo', 'em_manutencao', 'removido');--> statement-breakpoint
CREATE TYPE "public"."finance_category_type" AS ENUM('receita', 'despesa');--> statement-breakpoint
CREATE TYPE "public"."payable_status" AS ENUM('aberto', 'pago', 'cancelado');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('pix', 'boleto', 'cartao', 'dinheiro', 'transferencia', 'outro');--> statement-breakpoint
CREATE TYPE "public"."payout_status" AS ENUM('aberto', 'pago', 'cancelado');--> statement-breakpoint
CREATE TYPE "public"."person_type" AS ENUM('pf', 'pj');--> statement-breakpoint
CREATE TYPE "public"."photo_kind" AS ENUM('antes', 'depois', 'problema', 'outro');--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('baixa', 'normal', 'alta', 'urgente');--> statement-breakpoint
CREATE TYPE "public"."purchase_order_status" AS ENUM('rascunho', 'enviado', 'recebido_parcial', 'recebido', 'cancelado');--> statement-breakpoint
CREATE TYPE "public"."purchase_request_reason" AS ENUM('estoque_minimo', 'om', 'manual');--> statement-breakpoint
CREATE TYPE "public"."purchase_request_status" AS ENUM('aberta', 'em_pedido', 'atendida', 'cancelada');--> statement-breakpoint
CREATE TYPE "public"."receivable_kind" AS ENUM('mensalidade', 'servico', 'outro');--> statement-breakpoint
CREATE TYPE "public"."receivable_status" AS ENUM('aberto', 'em_analise', 'pago', 'cancelado');--> statement-breakpoint
CREATE TYPE "public"."stock_location_type" AS ENUM('almoxarifado', 'veiculo');--> statement-breakpoint
CREATE TYPE "public"."stock_movement_type" AS ENUM('entrada', 'saida', 'ajuste', 'transferencia', 'consumo_om', 'estorno_om');--> statement-breakpoint
CREATE TYPE "public"."work_order_origin" AS ENUM('automatica', 'manual', 'portal_cliente');--> statement-breakpoint
CREATE TYPE "public"."work_order_status" AS ENUM('aberta', 'agendada', 'em_deslocamento', 'em_execucao', 'pausada', 'aguardando_material', 'concluida', 'cancelada');--> statement-breakpoint
CREATE TYPE "public"."work_order_type" AS ENUM('preventiva', 'corretiva', 'instalacao', 'visita_tecnica', 'pmoc');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"impersonated_by" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"role" text DEFAULT 'cliente',
	"banned" boolean DEFAULT false,
	"ban_reason" text,
	"ban_expires" timestamp,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"name" text NOT NULL,
	"zip" text,
	"street" text,
	"number" text,
	"complement" text,
	"district" text,
	"city" text,
	"state" text,
	"lat" double precision,
	"lng" double precision,
	"access_notes" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"area_m2" double precision,
	"occupants" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" integer GENERATED ALWAYS AS IDENTITY (sequence name "customers_code_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"person_type" "person_type" DEFAULT 'pf' NOT NULL,
	"name" text NOT NULL,
	"trade_name" text,
	"document" text,
	"email" text,
	"phone" text,
	"whatsapp" text,
	"status" "customer_status" DEFAULT 'ativo' NOT NULL,
	"notes" text,
	"user_id" text,
	"default_technician_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "equipment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" integer GENERATED ALWAYS AS IDENTITY (sequence name "equipment_code_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"customer_id" uuid NOT NULL,
	"site_id" uuid,
	"type_id" uuid,
	"brand" text,
	"model" text,
	"serial_number" text,
	"capacity_btu" integer,
	"refrigerant" text,
	"voltage" text,
	"location" text,
	"install_date" date,
	"warranty_until" date,
	"status" "equipment_status" DEFAULT 'ativo' NOT NULL,
	"qr_token" text NOT NULL,
	"photo_url" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "equipment_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category" text DEFAULT 'climatizacao' NOT NULL,
	"icon" text DEFAULT 'air-vent' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "equipment_types_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "commission_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"technician_id" uuid NOT NULL,
	"work_order_id" uuid NOT NULL,
	"rule_id" uuid,
	"basis" "commission_basis" NOT NULL,
	"base_amount" numeric(12, 2) NOT NULL,
	"rate" numeric(12, 2) NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"period" text NOT NULL,
	"status" "commission_status" DEFAULT 'pendente' NOT NULL,
	"payout_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"technician_id" uuid NOT NULL,
	"period" text NOT NULL,
	"total_amount" numeric(12, 2) NOT NULL,
	"status" "payout_status" DEFAULT 'aberto' NOT NULL,
	"paid_at" timestamp with time zone,
	"payable_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"technician_id" uuid,
	"work_order_type" "work_order_type",
	"basis" "commission_basis" NOT NULL,
	"rate" numeric(12, 2) NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "technician_absences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"technician_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "technicians" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"name" text NOT NULL,
	"phone" text,
	"email" text,
	"document" text,
	"color" text DEFAULT '#3aa8ff' NOT NULL,
	"skills" text[] DEFAULT '{}' NOT NULL,
	"vehicle_plate" text,
	"admission_date" date,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contract_equipment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"contract_id" uuid NOT NULL,
	"equipment_id" uuid NOT NULL,
	"maintenance_plan_id" uuid NOT NULL,
	"anchor_date" date NOT NULL,
	"preferred_technician_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"removed_at" timestamp with time zone,
	"last_generated_due_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" integer GENERATED ALWAYS AS IDENTITY (sequence name "contracts_code_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"customer_id" uuid NOT NULL,
	"name" text NOT NULL,
	"monthly_amount" numeric(12, 2) NOT NULL,
	"billing_day" integer DEFAULT 10 NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"status" "contract_status" DEFAULT 'ativo' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maintenance_plan_materials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" numeric(12, 3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maintenance_plan_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"title" text NOT NULL,
	"instructions" text,
	"frequency_months" integer DEFAULT 1 NOT NULL,
	"measurement_unit" text,
	"requires_photo" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maintenance_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"equipment_type_id" uuid,
	"is_pmoc" boolean DEFAULT false NOT NULL,
	"estimated_minutes" integer DEFAULT 60 NOT NULL,
	"visit_reference_value" numeric(12, 2) DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sku" text,
	"name" text NOT NULL,
	"category" text DEFAULT 'peca' NOT NULL,
	"unit" text DEFAULT 'un' NOT NULL,
	"cost_price" numeric(12, 2) DEFAULT 0 NOT NULL,
	"sale_price" numeric(12, 2) DEFAULT 0 NOT NULL,
	"min_stock" numeric(12, 3) DEFAULT 0 NOT NULL,
	"reorder_qty" numeric(12, 3) DEFAULT 0 NOT NULL,
	"preferred_supplier_id" uuid,
	"barcode" text,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" numeric(12, 3) NOT NULL,
	"unit_cost" numeric(12, 2) DEFAULT 0 NOT NULL,
	"received_quantity" numeric(12, 3) DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" integer GENERATED ALWAYS AS IDENTITY (sequence name "purchase_orders_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"supplier_id" uuid,
	"status" "purchase_order_status" DEFAULT 'rascunho' NOT NULL,
	"order_date" date,
	"expected_date" date,
	"received_at" timestamp with time zone,
	"location_id" uuid,
	"freight" numeric(12, 2) DEFAULT 0 NOT NULL,
	"total" numeric(12, 2) DEFAULT 0 NOT NULL,
	"payable_id" uuid,
	"notes" text,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" numeric(12, 3) NOT NULL,
	"reason" "purchase_request_reason" DEFAULT 'manual' NOT NULL,
	"status" "purchase_request_status" DEFAULT 'aberta' NOT NULL,
	"work_order_id" uuid,
	"purchase_order_id" uuid,
	"notes" text,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_levels" (
	"product_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"quantity" numeric(12, 3) DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_levels_product_id_location_id_pk" PRIMARY KEY("product_id","location_id")
);
--> statement-breakpoint
CREATE TABLE "stock_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" "stock_location_type" DEFAULT 'almoxarifado' NOT NULL,
	"technician_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"type" "stock_movement_type" NOT NULL,
	"quantity" numeric(12, 3) NOT NULL,
	"unit_cost" numeric(12, 2) DEFAULT 0 NOT NULL,
	"work_order_id" uuid,
	"purchase_order_id" uuid,
	"transfer_group_id" uuid,
	"notes" text,
	"user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"document" text,
	"contact_name" text,
	"phone" text,
	"email" text,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_order_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_order_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"from_status" "work_order_status",
	"to_status" "work_order_status",
	"message" text,
	"user_id" text,
	"lat" double precision,
	"lng" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_order_materials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"location_id" uuid,
	"quantity" numeric(12, 3) NOT NULL,
	"unit_cost" numeric(12, 2) DEFAULT 0 NOT NULL,
	"unit_price" numeric(12, 2) DEFAULT 0 NOT NULL,
	"charge_customer" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_order_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_order_id" uuid NOT NULL,
	"task_id" uuid,
	"url" text NOT NULL,
	"kind" "photo_kind" DEFAULT 'outro' NOT NULL,
	"caption" text,
	"taken_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_order_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_order_id" uuid NOT NULL,
	"plan_task_id" uuid,
	"position" integer DEFAULT 0 NOT NULL,
	"title" text NOT NULL,
	"instructions" text,
	"measurement_unit" text,
	"measurement_value" text,
	"requires_photo" boolean DEFAULT false NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"notes" text,
	"done_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "work_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" integer GENERATED ALWAYS AS IDENTITY (sequence name "work_orders_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"type" "work_order_type" DEFAULT 'preventiva' NOT NULL,
	"origin" "work_order_origin" DEFAULT 'manual' NOT NULL,
	"status" "work_order_status" DEFAULT 'aberta' NOT NULL,
	"priority" "priority" DEFAULT 'normal' NOT NULL,
	"customer_id" uuid NOT NULL,
	"site_id" uuid,
	"equipment_id" uuid,
	"contract_equipment_id" uuid,
	"maintenance_plan_id" uuid,
	"technician_id" uuid,
	"due_date" date,
	"scheduled_date" date,
	"scheduled_time" time,
	"title" text NOT NULL,
	"description" text,
	"diagnosis" text,
	"solution" text,
	"technician_notes" text,
	"travel_started_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"check_in_lat" double precision,
	"check_in_lng" double precision,
	"check_out_lat" double precision,
	"check_out_lng" double precision,
	"signature_url" text,
	"signed_by_name" text,
	"labor_amount" numeric(12, 2) DEFAULT 0 NOT NULL,
	"total_amount" numeric(12, 2) DEFAULT 0 NOT NULL,
	"billable" boolean DEFAULT false NOT NULL,
	"receivable_id" uuid,
	"rating" integer,
	"rating_comment" text,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"initial_balance" numeric(12, 2) DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" "finance_category_type" NOT NULL,
	"color" text DEFAULT '#3aa8ff' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_id" uuid,
	"category_id" uuid,
	"description" text NOT NULL,
	"document_number" text,
	"due_date" date NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"paid_amount" numeric(12, 2),
	"paid_at" timestamp with time zone,
	"status" "payable_status" DEFAULT 'aberto' NOT NULL,
	"payment_method" "payment_method",
	"bank_account_id" uuid,
	"purchase_order_id" uuid,
	"commission_payout_id" uuid,
	"attachment_url" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receivables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid,
	"contract_id" uuid,
	"work_order_id" uuid,
	"category_id" uuid,
	"kind" "receivable_kind" DEFAULT 'outro' NOT NULL,
	"description" text NOT NULL,
	"competence" text,
	"due_date" date NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"discount" numeric(12, 2) DEFAULT 0 NOT NULL,
	"fine" numeric(12, 2) DEFAULT 0 NOT NULL,
	"interest" numeric(12, 2) DEFAULT 0 NOT NULL,
	"paid_amount" numeric(12, 2),
	"paid_at" timestamp with time zone,
	"status" "receivable_status" DEFAULT 'aberto' NOT NULL,
	"payment_method" "payment_method",
	"bank_account_id" uuid,
	"pix_txid" text,
	"proof_url" text,
	"proof_sent_at" timestamp with time zone,
	"gateway_provider" text,
	"gateway_id" text,
	"notes" text,
	"confirmed_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"ok" boolean,
	"summary" text,
	"triggered_by" text
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"link" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pmoc_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"site_id" uuid,
	"responsible_name" text NOT NULL,
	"responsible_registry" text,
	"art_number" text,
	"valid_from" date NOT NULL,
	"valid_until" date NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"company_name" text DEFAULT 'Imperium Tec Refrigeração' NOT NULL,
	"document" text,
	"phone" text,
	"whatsapp" text,
	"email" text,
	"address" text,
	"city" text,
	"state" text,
	"pix_key" text,
	"pix_merchant_name" text,
	"pix_merchant_city" text,
	"late_fine_percent" numeric(12, 2) DEFAULT 2 NOT NULL,
	"late_interest_monthly_percent" numeric(12, 2) DEFAULT 1 NOT NULL,
	"invoice_lead_days" integer DEFAULT 15 NOT NULL,
	"work_order_horizon_days" integer DEFAULT 30 NOT NULL,
	"block_overdue_days" integer DEFAULT 0 NOT NULL,
	"works_saturday" boolean DEFAULT false NOT NULL,
	"commission_trigger" text DEFAULT 'conclusao' NOT NULL,
	"service_due_days" integer DEFAULT 5 NOT NULL,
	"pmoc_responsible_name" text,
	"pmoc_responsible_registry" text,
	"pmoc_responsible_art" text,
	"last_daily_run_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_sites" ADD CONSTRAINT "customer_sites_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_site_id_customer_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."customer_sites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_type_id_equipment_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."equipment_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_entries" ADD CONSTRAINT "commission_entries_technician_id_technicians_id_fk" FOREIGN KEY ("technician_id") REFERENCES "public"."technicians"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_entries" ADD CONSTRAINT "commission_entries_rule_id_commission_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."commission_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_entries" ADD CONSTRAINT "commission_entries_payout_id_commission_payouts_id_fk" FOREIGN KEY ("payout_id") REFERENCES "public"."commission_payouts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_payouts" ADD CONSTRAINT "commission_payouts_technician_id_technicians_id_fk" FOREIGN KEY ("technician_id") REFERENCES "public"."technicians"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_technician_id_technicians_id_fk" FOREIGN KEY ("technician_id") REFERENCES "public"."technicians"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technician_absences" ADD CONSTRAINT "technician_absences_technician_id_technicians_id_fk" FOREIGN KEY ("technician_id") REFERENCES "public"."technicians"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technicians" ADD CONSTRAINT "technicians_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_equipment" ADD CONSTRAINT "contract_equipment_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_equipment" ADD CONSTRAINT "contract_equipment_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_equipment" ADD CONSTRAINT "contract_equipment_maintenance_plan_id_maintenance_plans_id_fk" FOREIGN KEY ("maintenance_plan_id") REFERENCES "public"."maintenance_plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_equipment" ADD CONSTRAINT "contract_equipment_preferred_technician_id_technicians_id_fk" FOREIGN KEY ("preferred_technician_id") REFERENCES "public"."technicians"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_plan_materials" ADD CONSTRAINT "maintenance_plan_materials_plan_id_maintenance_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."maintenance_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_plan_materials" ADD CONSTRAINT "maintenance_plan_materials_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_plan_tasks" ADD CONSTRAINT "maintenance_plan_tasks_plan_id_maintenance_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."maintenance_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_plans" ADD CONSTRAINT "maintenance_plans_equipment_type_id_equipment_types_id_fk" FOREIGN KEY ("equipment_type_id") REFERENCES "public"."equipment_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_preferred_supplier_id_suppliers_id_fk" FOREIGN KEY ("preferred_supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_location_id_stock_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."stock_locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_location_id_stock_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."stock_locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_locations" ADD CONSTRAINT "stock_locations_technician_id_technicians_id_fk" FOREIGN KEY ("technician_id") REFERENCES "public"."technicians"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_location_id_stock_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."stock_locations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_events" ADD CONSTRAINT "work_order_events_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_events" ADD CONSTRAINT "work_order_events_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_materials" ADD CONSTRAINT "work_order_materials_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_materials" ADD CONSTRAINT "work_order_materials_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_materials" ADD CONSTRAINT "work_order_materials_location_id_stock_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."stock_locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_photos" ADD CONSTRAINT "work_order_photos_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_photos" ADD CONSTRAINT "work_order_photos_task_id_work_order_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."work_order_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_photos" ADD CONSTRAINT "work_order_photos_taken_by_id_user_id_fk" FOREIGN KEY ("taken_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_tasks" ADD CONSTRAINT "work_order_tasks_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_tasks" ADD CONSTRAINT "work_order_tasks_plan_task_id_maintenance_plan_tasks_id_fk" FOREIGN KEY ("plan_task_id") REFERENCES "public"."maintenance_plan_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_site_id_customer_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."customer_sites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_contract_equipment_id_contract_equipment_id_fk" FOREIGN KEY ("contract_equipment_id") REFERENCES "public"."contract_equipment"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_maintenance_plan_id_maintenance_plans_id_fk" FOREIGN KEY ("maintenance_plan_id") REFERENCES "public"."maintenance_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_technician_id_technicians_id_fk" FOREIGN KEY ("technician_id") REFERENCES "public"."technicians"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payables" ADD CONSTRAINT "payables_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payables" ADD CONSTRAINT "payables_category_id_finance_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."finance_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payables" ADD CONSTRAINT "payables_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_category_id_finance_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."finance_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receivables" ADD CONSTRAINT "receivables_confirmed_by_id_user_id_fk" FOREIGN KEY ("confirmed_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pmoc_documents" ADD CONSTRAINT "pmoc_documents_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pmoc_documents" ADD CONSTRAINT "pmoc_documents_site_id_customer_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."customer_sites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "customer_sites_customer_idx" ON "customer_sites" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "customers_name_idx" ON "customers" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_user_id_uq" ON "customers" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "customers_document_idx" ON "customers" USING btree ("document");--> statement-breakpoint
CREATE INDEX "equipment_customer_idx" ON "equipment" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "equipment_site_idx" ON "equipment" USING btree ("site_id");--> statement-breakpoint
CREATE UNIQUE INDEX "equipment_qr_token_uq" ON "equipment" USING btree ("qr_token");--> statement-breakpoint
CREATE UNIQUE INDEX "commission_entries_wo_tech_uq" ON "commission_entries" USING btree ("work_order_id","technician_id");--> statement-breakpoint
CREATE INDEX "commission_entries_period_idx" ON "commission_entries" USING btree ("period");--> statement-breakpoint
CREATE INDEX "technician_absences_tech_idx" ON "technician_absences" USING btree ("technician_id");--> statement-breakpoint
CREATE UNIQUE INDEX "technicians_user_id_uq" ON "technicians" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "contract_equipment_contract_idx" ON "contract_equipment" USING btree ("contract_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contract_equipment_active_uq" ON "contract_equipment" USING btree ("equipment_id") WHERE "contract_equipment"."active" = true;--> statement-breakpoint
CREATE INDEX "contracts_customer_idx" ON "contracts" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "maintenance_plan_materials_uq" ON "maintenance_plan_materials" USING btree ("plan_id","product_id");--> statement-breakpoint
CREATE INDEX "maintenance_plan_tasks_plan_idx" ON "maintenance_plan_tasks" USING btree ("plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "products_sku_uq" ON "products" USING btree ("sku");--> statement-breakpoint
CREATE INDEX "products_name_idx" ON "products" USING btree ("name");--> statement-breakpoint
CREATE INDEX "purchase_order_items_po_idx" ON "purchase_order_items" USING btree ("purchase_order_id");--> statement-breakpoint
CREATE INDEX "purchase_requests_status_idx" ON "purchase_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "stock_movements_product_idx" ON "stock_movements" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "stock_movements_wo_idx" ON "stock_movements" USING btree ("work_order_id");--> statement-breakpoint
CREATE INDEX "work_order_events_wo_idx" ON "work_order_events" USING btree ("work_order_id");--> statement-breakpoint
CREATE INDEX "work_order_materials_wo_idx" ON "work_order_materials" USING btree ("work_order_id");--> statement-breakpoint
CREATE INDEX "work_order_photos_wo_idx" ON "work_order_photos" USING btree ("work_order_id");--> statement-breakpoint
CREATE INDEX "work_order_tasks_wo_idx" ON "work_order_tasks" USING btree ("work_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "work_orders_number_uq" ON "work_orders" USING btree ("number");--> statement-breakpoint
CREATE INDEX "work_orders_status_idx" ON "work_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "work_orders_tech_date_idx" ON "work_orders" USING btree ("technician_id","scheduled_date");--> statement-breakpoint
CREATE INDEX "work_orders_customer_idx" ON "work_orders" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "work_orders_equipment_idx" ON "work_orders" USING btree ("equipment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "work_orders_auto_uq" ON "work_orders" USING btree ("contract_equipment_id","due_date") WHERE "work_orders"."origin" = 'automatica';--> statement-breakpoint
CREATE INDEX "payables_due_idx" ON "payables" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "payables_status_idx" ON "payables" USING btree ("status");--> statement-breakpoint
CREATE INDEX "receivables_due_idx" ON "receivables" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "receivables_customer_idx" ON "receivables" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "receivables_status_idx" ON "receivables" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "receivables_contract_competence_uq" ON "receivables" USING btree ("contract_id","competence") WHERE "receivables"."kind" = 'mensalidade';--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "pmoc_documents_customer_idx" ON "pmoc_documents" USING btree ("customer_id");
-- CreateTable
CREATE TABLE "facility" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "national_code" TEXT,
    "type" TEXT NOT NULL,
    "ward" TEXT,
    "town" TEXT,
    "lga" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "contact_phone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "facility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_user" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "phone" TEXT,
    "pin_hash" TEXT NOT NULL,
    "password_hash" TEXT,
    "roles" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'active',
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_facility" (
    "user_id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,

    CONSTRAINT "user_facility_pkey" PRIMARY KEY ("user_id","facility_id")
);

-- CreateTable
CREATE TABLE "device" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "label" TEXT,
    "last_seen_at" TIMESTAMP(3),
    "last_push_seq" BIGINT NOT NULL DEFAULT 0,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_token" (
    "id" UUID NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "device_id" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "synced_entity" (
    "entity_type" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "rev" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "origin_device_id" TEXT,
    "needs_review" BOOLEAN NOT NULL DEFAULT false,
    "server_seq" BIGINT NOT NULL,

    CONSTRAINT "synced_entity_pkey" PRIMARY KEY ("entity_type","id")
);

-- CreateTable
CREATE TABLE "change_log" (
    "server_seq" BIGSERIAL NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "op" TEXT NOT NULL,
    "rev" INTEGER NOT NULL,
    "payload" JSONB,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "origin_device_id" TEXT,

    CONSTRAINT "change_log_pkey" PRIMARY KEY ("server_seq")
);

-- CreateTable
CREATE TABLE "conflict_queue" (
    "id" UUID NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "fields" TEXT[],
    "server_payload" JSONB NOT NULL,
    "client_payload" JSONB NOT NULL,
    "device_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "resolved_by" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conflict_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_event" (
    "id" UUID NOT NULL,
    "actor_user_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "facility_id" TEXT,
    "device_id" TEXT,
    "details" JSONB,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "facility_code_key" ON "facility"("code");

-- CreateIndex
CREATE UNIQUE INDEX "app_user_username_key" ON "app_user"("username");

-- CreateIndex
CREATE INDEX "device_user_id_idx" ON "device"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_token_token_hash_key" ON "refresh_token"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_token_user_id_idx" ON "refresh_token"("user_id");

-- CreateIndex
CREATE INDEX "synced_entity_facility_id_entity_type_idx" ON "synced_entity"("facility_id", "entity_type");

-- CreateIndex
CREATE INDEX "synced_entity_server_seq_idx" ON "synced_entity"("server_seq");

-- CreateIndex
CREATE INDEX "change_log_server_seq_facility_id_idx" ON "change_log"("server_seq", "facility_id");

-- CreateIndex
CREATE INDEX "change_log_entity_type_entity_id_idx" ON "change_log"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "conflict_queue_status_facility_id_idx" ON "conflict_queue"("status", "facility_id");

-- CreateIndex
CREATE INDEX "audit_event_at_idx" ON "audit_event"("at");

-- CreateIndex
CREATE INDEX "audit_event_entity_type_entity_id_idx" ON "audit_event"("entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "user_facility" ADD CONSTRAINT "user_facility_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_facility" ADD CONSTRAINT "user_facility_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facility"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device" ADD CONSTRAINT "device_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_token" ADD CONSTRAINT "refresh_token_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "synced_entity" ADD CONSTRAINT "synced_entity_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

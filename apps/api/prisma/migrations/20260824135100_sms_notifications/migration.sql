-- CreateTable
CREATE TABLE "sms_template" (
    "key" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "body_en" TEXT NOT NULL,
    "body_ig" TEXT NOT NULL,
    "updated_by" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sms_template_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "sms_message" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "template_key" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "rendered_body" TEXT NOT NULL,
    "to_phone" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "skipped_reason" TEXT,
    "failure_reason" TEXT,
    "provider" TEXT,
    "provider_message_id" TEXT,
    "segments" INTEGER NOT NULL DEFAULT 1,
    "triggered_by" TEXT NOT NULL,
    "reminder_key" TEXT,
    "scheduled_for" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sms_message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sms_message_reminder_key_key" ON "sms_message"("reminder_key");

-- CreateIndex
CREATE INDEX "sms_message_facility_id_status_idx" ON "sms_message"("facility_id", "status");

-- CreateIndex
CREATE INDEX "sms_message_patient_id_idx" ON "sms_message"("patient_id");

-- CreateIndex
CREATE INDEX "sms_message_provider_message_id_idx" ON "sms_message"("provider_message_id");

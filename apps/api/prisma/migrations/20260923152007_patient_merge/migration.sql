-- CreateTable
CREATE TABLE "patient_merge" (
    "id" UUID NOT NULL,
    "surviving_id" TEXT NOT NULL,
    "merged_id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "merged_by" TEXT NOT NULL,
    "merged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT NOT NULL,
    "details" JSONB NOT NULL,

    CONSTRAINT "patient_merge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "patient_merge_merged_id_key" ON "patient_merge"("merged_id");

-- CreateIndex
CREATE INDEX "patient_merge_surviving_id_idx" ON "patient_merge"("surviving_id");

-- CreateIndex
CREATE INDEX "patient_merge_facility_id_merged_at_idx" ON "patient_merge"("facility_id", "merged_at");

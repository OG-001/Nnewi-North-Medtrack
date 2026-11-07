CREATE TABLE "medications" (
    "id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "drug_name" TEXT NOT NULL,
    "dosage" TEXT NOT NULL,
    "time_to_take" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT NOT NULL,
    "rev" INTEGER NOT NULL DEFAULT 1,
    "deleted_at" TIMESTAMP(3),
    "origin_device_id" TEXT NOT NULL,

    CONSTRAINT "medications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "medications_facility_id_patient_id_created_at_idx"
    ON "medications"("facility_id", "patient_id", "created_at");

ALTER TABLE "medications"
    ADD CONSTRAINT "medications_facility_id_fkey"
    FOREIGN KEY ("facility_id") REFERENCES "facility"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

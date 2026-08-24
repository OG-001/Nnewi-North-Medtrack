-- CreateTable
CREATE TABLE "monthly_report" (
    "id" UUID NOT NULL,
    "facility_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "figures" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generated_by" TEXT,
    "locked_at" TIMESTAMP(3),
    "locked_by" TEXT,

    CONSTRAINT "monthly_report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_adjustment" (
    "id" UUID NOT NULL,
    "report_id" UUID NOT NULL,
    "figure_key" TEXT NOT NULL,
    "from_value" INTEGER NOT NULL,
    "to_value" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_adjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "monthly_report_year_month_idx" ON "monthly_report"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_report_facility_id_year_month_key" ON "monthly_report"("facility_id", "year", "month");

-- CreateIndex
CREATE INDEX "report_adjustment_report_id_idx" ON "report_adjustment"("report_id");

-- AddForeignKey
ALTER TABLE "report_adjustment" ADD CONSTRAINT "report_adjustment_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "monthly_report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

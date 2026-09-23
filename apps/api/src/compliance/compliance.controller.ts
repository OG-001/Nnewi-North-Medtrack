import { Controller, Get } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Public } from "../common/decorators/roles.decorator";

/**
 * Who is accountable for this deployment, and what it does with data.
 *
 * Under the NDPA accountability principle a controller must be identifiable,
 * and a data subject has to be able to find out who holds their record and how
 * to reach the Data Protection Officer. So this is deliberately **public**: it
 * carries no patient data, only the named roles and the retention policy.
 *
 * It reads from the environment rather than from code, because the controller
 * and DPO change with the post, not with a release.
 */
@Controller("system")
export class ComplianceController {
  constructor(private readonly config: ConfigService) {}

  @Public()
  @Get("compliance")
  compliance() {
    const notSet = "Not yet designated";
    return {
      controller: this.config.get("PHC_DATA_CONTROLLER") || notSet,
      dpo: {
        name: this.config.get("PHC_DPO_NAME") || notSet,
        contact: this.config.get("PHC_DPO_CONTACT") || notSet,
      },
      residency: {
        country: "Nigeria",
        note: "Self-hosted in Nigeria. Patient data and its backups do not leave the country.",
      },
      retention: {
        general_years: Number(this.config.get("PHC_RETENTION_GENERAL_YEARS") ?? 10),
        maternity_years: Number(this.config.get("PHC_RETENTION_MATERNITY_YEARS") ?? 25),
        child_until_age: Number(this.config.get("PHC_RETENTION_CHILD_UNTIL_AGE") ?? 18),
        backup_days: Number(this.config.get("BACKUP_RETENTION_DAYS") ?? 30),
        // Stated so nobody assumes the software prunes records on its own.
        note:
          "Retention governs archival review, not automatic deletion. Clinical data is " +
          "never hard-deleted by the application (Global Constraint 3); removing a record " +
          "at the end of its retention period is a reviewed, audited operation.",
      },
      features: {
        // SMS is off for this deployment. See the change log for why.
        sms_enabled: this.config.get("SMS_ENABLED") === "true",
      },
      legal_basis: "Nigeria Data Protection Act 2023",
    };
  }
}

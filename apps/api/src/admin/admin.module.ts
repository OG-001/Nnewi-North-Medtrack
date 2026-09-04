import { Module } from "@nestjs/common";
import { ConflictsController } from "./conflicts.controller";
import { StaffController } from "./staff.controller";
import { StaffService } from "./staff.service";
import { FacilitiesController } from "./facilities.controller";
import { FacilitiesService } from "./facilities.service";
import { AuditController } from "./audit.controller";
import { AuditService } from "./audit.service";

@Module({
  providers: [StaffService, FacilitiesService, AuditService],
  controllers: [ConflictsController, StaffController, FacilitiesController, AuditController],
})
export class AdminModule {}

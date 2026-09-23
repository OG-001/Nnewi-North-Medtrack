import { Module } from "@nestjs/common";
import { PatientsService } from "./patients.service";
import { PatientMergeService } from "./merge.service";
import { PatientsController } from "./patients.controller";

@Module({
  providers: [PatientsService, PatientMergeService],
  controllers: [PatientsController],
})
export class PatientsModule {}

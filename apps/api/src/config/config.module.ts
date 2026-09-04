import { Module } from "@nestjs/common";
import { ClinicalConfigService } from "./config.service";
import { ClinicalConfigController } from "./config.controller";

@Module({ providers: [ClinicalConfigService], controllers: [ClinicalConfigController] })
export class ClinicalConfigModule {}

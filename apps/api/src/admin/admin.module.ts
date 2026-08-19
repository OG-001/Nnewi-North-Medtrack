import { Module } from "@nestjs/common";
import { ConflictsController } from "./conflicts.controller";

@Module({ controllers: [ConflictsController] })
export class AdminModule {}

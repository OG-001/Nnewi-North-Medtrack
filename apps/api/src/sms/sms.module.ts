import { Module } from "@nestjs/common";
import { SmsService } from "./sms.service";
import { SmsController } from "./sms.controller";
import { ReminderScheduler } from "./reminder.scheduler";
import { AfricasTalkingProvider } from "./providers/africastalking.provider";
import { TermiiProvider } from "./providers/termii.provider";

@Module({
  providers: [SmsService, ReminderScheduler, AfricasTalkingProvider, TermiiProvider],
  controllers: [SmsController],
  exports: [SmsService],
})
export class SmsModule {}

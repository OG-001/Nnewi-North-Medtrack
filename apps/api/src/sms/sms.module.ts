import { Module } from "@nestjs/common";
import { SmsService } from "./sms.service";
import { SmsEnabledGuard } from "./sms-enabled.guard";
import { SmsController } from "./sms.controller";
import { ReminderScheduler } from "./reminder.scheduler";
import { AfricasTalkingProvider } from "./providers/africastalking.provider";
import { TermiiProvider } from "./providers/termii.provider";

@Module({
  providers: [SmsEnabledGuard, SmsService, ReminderScheduler, AfricasTalkingProvider, TermiiProvider],
  controllers: [SmsController],
  exports: [SmsService],
})
export class SmsModule {}

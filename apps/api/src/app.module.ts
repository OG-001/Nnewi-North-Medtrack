import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { PrismaModule } from "./prisma/prisma.module";
import { FacilityPermissionsModule } from "./common/facility-permissions.service";
import { AuthModule } from "./auth/auth.module";
import { SyncModule } from "./sync/sync.module";
import { SystemModule } from "./system/system.module";
import { ComplianceModule } from "./compliance/compliance.module";
import { AdminModule } from "./admin/admin.module";
import { SmsModule } from "./sms/sms.module";
import { ReportsModule } from "./reports/reports.module";
import { ClinicalConfigModule } from "./config/config.module";
import { PatientsModule } from "./patients/patients.module";
import { JwtAuthGuard } from "./common/guards/jwt-auth.guard";
import { RolesGuard } from "./common/guards/roles.guard";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Rate limiting (api-design section 7). Configurable, because the right
    // limit differs by deployment: a busy PHC syncing several devices needs
    // more headroom than the default, and a test run needs far more again.
    ThrottlerModule.forRoot([
      {
        ttl: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000),
        limit: Number(process.env.RATE_LIMIT_PER_WINDOW ?? 120),
      },
    ]),
    PrismaModule,
    FacilityPermissionsModule,
    AuthModule,
    SyncModule,
    SystemModule,
    ComplianceModule,
    AdminModule,
    SmsModule,
    ReportsModule,
    ClinicalConfigModule,
    PatientsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}

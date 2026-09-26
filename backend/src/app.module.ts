import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { GlobalJwtAuthGuard, PermissionsGuard } from './authz/authz.guards';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { MessagingModule } from './messaging/messaging.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { StudentsModule } from './students/students.module';
import { ParentsModule } from './parents/parents.module';
import { StaffModule } from './staff/staff.module';
import { AcademicYearsModule } from './academic-years/academic-years.module';
import { ClassesModule } from './classes/classes.module';
import { SubjectsModule } from './subjects/subjects.module';
import { AdmissionsModule } from './admissions/admissions.module';
import { AttendanceModule } from './attendance/attendance.module';
import { GradesModule } from './grades/grades.module';
import { BulletinsModule } from './bulletins/bulletins.module';
import { BillingModule } from './billing/billing.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ParentPortalModule } from './parent-portal/parent-portal.module';
import { NotificationsModule } from './notifications/notifications.module';
import { TransportModule } from './transport/transport.module';
import { PayrollModule } from './payroll/payroll.module';
import { AnnouncementsModule } from './announcements/announcements.module';
import { PublicModule } from './public/public.module';
import { SchoolSettingsModule } from './school-settings/school-settings.module';
import { PlatformModule } from './platform/platform.module';
import { FeatureGuard } from './platform/feature.guard';
import { TimetableModule } from './timetable/timetable.module';
import { DocumentsModule } from './documents/documents.module';
import { AiModule } from './ai/ai.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env.local',
    }),
    // Global rate limit per IP (API_RATE_LIMIT per minute); stricter limits on login, public forms and AI.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: () => Number(process.env.API_RATE_LIMIT) || 300 }]),
    PrismaModule,
    CommonModule,
    MessagingModule,
    AuthModule,
    UsersModule,
    StudentsModule,
    ParentsModule,
    StaffModule,
    AcademicYearsModule,
    ClassesModule,
    SubjectsModule,
    AdmissionsModule,
    AttendanceModule,
    GradesModule,
    BulletinsModule,
    BillingModule,
    DashboardModule,
    ParentPortalModule,
    NotificationsModule,
    TransportModule,
    PayrollModule,
    AnnouncementsModule,
    PublicModule,
    SchoolSettingsModule,
    PlatformModule,
    TimetableModule,
    DocumentsModule,
    AiModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Order matters: rate limit, authenticate, authorize (deny-by-default), then plan features.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: GlobalJwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: FeatureGuard },
  ],
})
export class AppModule {}

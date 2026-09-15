import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env.local',
    }),
    PrismaModule,
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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

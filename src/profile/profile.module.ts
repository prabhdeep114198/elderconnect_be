import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLogService } from '../common/services/audit-log.service';
import { AuditLog } from '../common/services/entities/audit-log.entity';
import { Appointment } from './entities/appointment.entity';
import { DailyHealthMetric } from './entities/daily-health-metric.entity';
import { MedicationLog } from './entities/medication-log.entity';
import { Medication } from './entities/medication.entity';
import { UserProfile } from './entities/user-profile.entity';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserProfile, Medication, MedicationLog, DailyHealthMetric, Appointment], 'profile'),
    TypeOrmModule.forFeature([AuditLog], 'audit'),
  ],
  controllers: [ProfileController],
  providers: [ProfileService, AuditLogService],
  exports: [ProfileService],
})
export class ProfileModule { }

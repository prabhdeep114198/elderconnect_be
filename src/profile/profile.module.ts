import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { UserProfile } from './entities/user-profile.entity';
import { Medication } from './entities/medication.entity';
import { MedicationLog } from './entities/medication-log.entity';
import { DailyHealthMetric } from './entities/daily-health-metric.entity';
import { AuditLogService } from '../common/services/audit-log.service';
import { AuditLog } from '../common/services/entities/audit-log.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserProfile, Medication, MedicationLog, DailyHealthMetric], 'profile'),
    TypeOrmModule.forFeature([AuditLog], 'audit'),
  ],
  controllers: [ProfileController],
  providers: [ProfileService, AuditLogService],
  exports: [ProfileService],
})
export class ProfileModule { }

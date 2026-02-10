import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { UserProfile } from './entities/user-profile.entity';
import { Medication } from './entities/medication.entity';
import { MedicationLog } from './entities/medication-log.entity';
import { DailyHealthMetric } from './entities/daily-health-metric.entity';
import { Appointment } from './entities/appointment.entity';
import { SocialEvent } from './entities/social-event.entity';
import { AuditLogService } from '../common/services/audit-log.service';
import { AuditLog } from '../common/services/entities/audit-log.entity';
import { EmergencyPredictionService } from './services/emergency-prediction.service';
import { EmergencyRiskLog } from './entities/emergency-risk-log.entity';
import { ReminderLog } from './entities/reminder-log.entity';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    NotificationModule,
    TypeOrmModule.forFeature([
      UserProfile,
      Medication,
      MedicationLog,
      DailyHealthMetric,
      Appointment,
      SocialEvent,
      EmergencyRiskLog,
      ReminderLog,
    ], 'profile'),
    TypeOrmModule.forFeature([AuditLog], 'audit'),
  ],
  controllers: [ProfileController],
  providers: [ProfileService, AuditLogService, EmergencyPredictionService],
  exports: [ProfileService, EmergencyPredictionService],
})
export class ProfileModule { }

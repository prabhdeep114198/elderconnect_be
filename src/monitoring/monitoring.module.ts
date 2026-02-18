import { Module } from '@nestjs/common';

import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { MetricsService } from './metrics.service';

import { TypeOrmModule } from '@nestjs/typeorm';
import { DailyHealthMetric } from '../profile/entities/daily-health-metric.entity';
import { ProfileModule } from '../profile/profile.module';
import { AnalyticsController } from './analytics.controller';
import { HealthAnalyticsService } from './analytics.service';
import { DebugController } from './debug.controller';

import { SOSAlert } from '../device/entities/sos-alert.entity';
import { TelemetryData } from '../device/entities/telemetry.entity';
import { MediaFile } from '../media/entities/media-file.entity';
import { Appointment } from '../profile/entities/appointment.entity';
import { MedicationLog } from '../profile/entities/medication-log.entity';
import { Medication } from '../profile/entities/medication.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DailyHealthMetric,
      Appointment,
      MedicationLog,
      Medication,
    ], 'profile'),
    TypeOrmModule.forFeature([
      MediaFile
    ], 'media'),
    TypeOrmModule.forFeature([
      TelemetryData,
      SOSAlert
    ], 'vitals'),
    ProfileModule,
  ],
  controllers: [HealthController, AnalyticsController, DebugController],
  providers: [HealthService, MetricsService, HealthAnalyticsService],
  exports: [HealthService, MetricsService, HealthAnalyticsService],
})
export class MonitoringModule { }

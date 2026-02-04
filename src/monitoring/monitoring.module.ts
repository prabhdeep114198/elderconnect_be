import { Module } from '@nestjs/common';

import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { MetricsService } from './metrics.service';

import { TypeOrmModule } from '@nestjs/typeorm';
import { DailyHealthMetric } from '../profile/entities/daily-health-metric.entity';
import { CacheModule } from '@nestjs/cache-manager';
import { HealthAnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { ProfileModule } from '../profile/profile.module';

import { Appointment } from '../profile/entities/appointment.entity';
import { MedicationLog } from '../profile/entities/medication-log.entity';
import { MediaFile } from '../media/entities/media-file.entity';
import { TelemetryData } from '../device/entities/telemetry.entity';
import { SOSAlert } from '../device/entities/sos-alert.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DailyHealthMetric,
      Appointment,
      MedicationLog,
      MediaFile,
      TelemetryData,
      SOSAlert
    ]),
    CacheModule,
    ProfileModule,
  ],
  controllers: [HealthController, AnalyticsController],
  providers: [HealthService, MetricsService, HealthAnalyticsService],
  exports: [HealthService, MetricsService, HealthAnalyticsService],
})
export class MonitoringModule { }

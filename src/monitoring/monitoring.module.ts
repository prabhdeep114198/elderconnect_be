import { Module } from '@nestjs/common';

import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { MetricsService } from './metrics.service';

import { TypeOrmModule } from '@nestjs/typeorm';
import { DailyHealthMetric } from '../profile/entities/daily-health-metric.entity';
import { UserProfile } from '../profile/entities/user-profile.entity';
import { ProfileModule } from '../profile/profile.module';
import { AnalyticsController } from './analytics.controller';
import { HealthAnalyticsService } from './analytics.service';
import { DebugController } from './debug.controller';
import { FallRiskController } from './fall-risk.controller';
import { FallRiskService } from './fall-risk.service';

import { SOSAlert } from '../device/entities/sos-alert.entity';
import { TelemetryData } from '../device/entities/telemetry.entity';
import { MediaFile } from '../media/entities/media-file.entity';
import { Appointment } from '../profile/entities/appointment.entity';
import { MedicationLog } from '../profile/entities/medication-log.entity';
import { Medication } from '../profile/entities/medication.entity';

// NOTE: We import AiEngineService directly (not AiModule) to avoid a
// circular dependency: AiModule → MonitoringModule → AiModule.
import { ConfigModule } from '@nestjs/config';
import { AiEngineService } from '../ai/ai-engine.service';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    ConfigModule,
    NotificationModule,
    TypeOrmModule.forFeature([
      DailyHealthMetric,
      UserProfile,
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
  controllers: [HealthController, AnalyticsController, DebugController, FallRiskController],
  providers: [
    HealthService,
    MetricsService,
    HealthAnalyticsService,
    FallRiskService,
    // Provide AiEngineService locally within MonitoringModule to avoid circular dep
    AiEngineService,
  ],
  exports: [HealthService, MetricsService, HealthAnalyticsService, FallRiskService],
})
export class MonitoringModule { }

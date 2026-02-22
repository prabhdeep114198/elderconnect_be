import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthDeteriorationTrend } from './entities/health-deterioration-trend.entity';
import { TrendAnalysisService } from './services/trend-analysis.service';
import { DeteriorationController } from './deterioration.controller';
import { DailyHealthMetric } from '../profile/entities/daily-health-metric.entity';
import { MedicationLog } from '../profile/entities/medication-log.entity';
import { EmergencyRiskLog } from '../profile/entities/emergency-risk-log.entity';

import { FallRiskAssessment } from './entities/fall-risk-assessment.entity';
import { FallRiskService } from './services/fall-risk.service';
import { SensorData } from '../device/entities/sensor-data.entity';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    TypeOrmModule.forFeature(
      [
        HealthDeteriorationTrend,
        DailyHealthMetric,
        MedicationLog,
        EmergencyRiskLog,
        FallRiskAssessment
      ],
      'profile',
    ),
    TypeOrmModule.forFeature([SensorData], 'vitals'),
    forwardRef(() => NotificationModule),
  ],
  controllers: [DeteriorationController],
  providers: [TrendAnalysisService, FallRiskService],
  exports: [TrendAnalysisService, FallRiskService],
})
export class DeteriorationModule { }

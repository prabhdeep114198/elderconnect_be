import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HealthDeteriorationTrend } from './entities/health-deterioration-trend.entity';
import { TrendAnalysisService } from './services/trend-analysis.service';
import { DeteriorationController } from './deterioration.controller';
import { DailyHealthMetric } from '../profile/entities/daily-health-metric.entity';
import { MedicationLog } from '../profile/entities/medication-log.entity';
import { EmergencyRiskLog } from '../profile/entities/emergency-risk-log.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature(
      [
        HealthDeteriorationTrend,
        DailyHealthMetric,
        MedicationLog,
        EmergencyRiskLog,
      ],
      'profile',
    ),
  ],
  controllers: [DeteriorationController],
  providers: [TrendAnalysisService],
  exports: [TrendAnalysisService],
})
export class DeteriorationModule { }

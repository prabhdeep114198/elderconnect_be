import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PersonalizedHealthScore } from './entities/health-score.entity';
import { HealthScoreService } from './services/health-score.service';
import { HealthScoreController } from './health-score.controller';
import { DailyHealthMetric } from '../profile/entities/daily-health-metric.entity';
import { MedicationLog } from '../profile/entities/medication-log.entity';
import { EmergencyRiskLog } from '../profile/entities/emergency-risk-log.entity';
import { HealthDeteriorationTrend } from '../deterioration/entities/health-deterioration-trend.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature(
      [
        PersonalizedHealthScore,
        DailyHealthMetric,
        MedicationLog,
        EmergencyRiskLog,
        HealthDeteriorationTrend,
      ],
      'profile',
    ),
  ],
  controllers: [HealthScoreController],
  providers: [HealthScoreService],
  exports: [HealthScoreService],
})
export class HealthScoreModule { }

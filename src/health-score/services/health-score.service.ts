import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { DailyHealthMetric } from '../../profile/entities/daily-health-metric.entity';
import {
  MedicationLog,
  MedicationLogStatus,
} from '../../profile/entities/medication-log.entity';
import { EmergencyRiskLog } from '../../profile/entities/emergency-risk-log.entity';
import { HealthDeteriorationTrend } from '../../deterioration/entities/health-deterioration-trend.entity';
import { PersonalizedHealthScore } from '../entities/health-score.entity';

@Injectable()
export class HealthScoreService {
  private readonly logger = new Logger(HealthScoreService.name);

  constructor(
    @InjectRepository(DailyHealthMetric, 'profile')
    private metricsRepo: Repository<DailyHealthMetric>,
    @InjectRepository(MedicationLog, 'profile')
    private medLogsRepo: Repository<MedicationLog>,
    @InjectRepository(EmergencyRiskLog, 'profile')
    private riskLogsRepo: Repository<EmergencyRiskLog>,
    @InjectRepository(HealthDeteriorationTrend, 'profile')
    private trendRepo: Repository<HealthDeteriorationTrend>,
    @InjectRepository(PersonalizedHealthScore, 'profile')
    private scoreRepo: Repository<PersonalizedHealthScore>,
  ) { }

  async computeDailyScore(userProfileId: string) {
    const today = new Date();
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

    // 1. Fetch Data Dimensions
    const metric =
      (await this.metricsRepo.findOne({
        where: { userProfileId, date: today },
      })) ||
      (await this.metricsRepo.findOne({
        where: { userProfileId },
        order: { date: 'DESC' },
      }));

    const recentMedLogs = await this.medLogsRepo.find({
      where: {
        medication: { userProfileId },
        scheduledTime: Between(yesterday, today),
      },
    });

    const recentRisks = await this.riskLogsRepo.find({
      where: { userProfileId, createdAt: Between(sevenDaysAgo, today) },
    });

    const trend = await this.trendRepo.findOne({
      where: { userProfileId },
      order: { assessmentDate: 'DESC' },
    });

    // 2. Compute Dimensions (0-100 each)
    // Adherence: 100 - (miss rate * 100)
    const missedCount = recentMedLogs.filter(
      (l) => l.status === MedicationLogStatus.MISSED,
    ).length;
    const adherenceScore =
      recentMedLogs.length > 0
        ? Math.max(0, 100 - (missedCount / recentMedLogs.length) * 100)
        : 100;

    // Vital Stability: 100 - (avg emergency risk * 100)
    const avgRisk =
      recentRisks.length > 0
        ? recentRisks.reduce((a, b) => a + b.riskScore, 0) / recentRisks.length
        : 0;
    const vitalStability = Math.max(0, 100 - avgRisk * 100);

    // Mobility: Steps relative to target (e.g. 8000)
    const mobilityScore = metric
      ? Math.min(100, (metric.steps / 8000) * 100)
      : 0;

    // Risk Exposure: Inverse of deterioration trend
    const riskExposure = trend ? 100 - trend.deteriorationScore : 100;

    // Lifestyle Consistency: Sleep & Water (Simplified)
    const sleepScore = metric
      ? metric.sleepHours
        ? Math.min(100, (metric.sleepHours / 8) * 100)
        : 100
      : 100;
    const waterScore = metric
      ? Math.min(100, (metric.waterIntake / 8) * 100)
      : 100;
    const lifestyleScore = (sleepScore + waterScore) / 2;

    // 3. Weighted Aggregation (Prompt 4)
    const rawScore =
      vitalStability * 0.25 +
      mobilityScore * 0.2 +
      adherenceScore * 0.25 +
      lifestyleScore * 0.15 +
      riskExposure * 0.15;

    // 4. Smoothing (Prompt 7)
    const lastScores = await this.scoreRepo.find({
      where: { userProfileId },
      order: { date: 'DESC' },
      take: 2,
    });
    const smoothedScore =
      lastScores.length > 0
        ? Math.round(
          (rawScore + lastScores.reduce((a, b) => a + b.score, 0)) /
          (lastScores.length + 1),
        )
        : Math.round(rawScore);

    // 5. Generate Explanations (Prompt 5)
    const explanations = this.generateExplanations({
      vitalStability,
      mobilityScore,
      adherenceScore,
      lifestyleScore,
      riskExposure,
    });

    const statusLabel =
      smoothedScore > 85
        ? 'Excellent'
        : smoothedScore > 60
          ? 'Stable'
          : 'Needs Attention';

    const healthScore = this.scoreRepo.create({
      userProfileId,
      date: today,
      score: smoothedScore,
      statusLabel,
      dimensions: {
        vitalStability,
        mobility: mobilityScore,
        adherence: adherenceScore,
        lifestyle: lifestyleScore,
        riskExposure,
      },
      explanations,
    });

    return await this.scoreRepo.save(healthScore);
  }

  private generateExplanations(dims: any): string[] {
    const list: string[] = [];
    if (dims.adherenceScore < 90)
      list.push('Consistency in taking medications could be improved.');
    if (dims.mobilityScore < 50)
      list.push('Physical activity is lower than your usual goal.');
    if (dims.vitalStability < 70)
      list.push('Recent vitals have shown slight fluctuations.');
    if (dims.lifestyleScore > 80)
      list.push('Excellent consistency in sleep and hydration patterns.');

    if (list.length === 0)
      list.push('All health parameters are within your normal healthy range.');
    return list.slice(0, 2); // Return top 2
  }
}

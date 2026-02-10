import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThan } from 'typeorm';
import { DailyHealthMetric } from '../../profile/entities/daily-health-metric.entity';
import {
  MedicationLog,
  MedicationLogStatus,
} from '../../profile/entities/medication-log.entity';
import { EmergencyRiskLog } from '../../profile/entities/emergency-risk-log.entity';
import { HealthDeteriorationTrend } from '../entities/health-deterioration-trend.entity';

@Injectable()
export class TrendAnalysisService {
  private readonly logger = new Logger(TrendAnalysisService.name);

  constructor(
    @InjectRepository(DailyHealthMetric, 'profile')
    private metricsRepo: Repository<DailyHealthMetric>,
    @InjectRepository(MedicationLog, 'profile')
    private medLogsRepo: Repository<MedicationLog>,
    @InjectRepository(EmergencyRiskLog, 'profile')
    private riskLogsRepo: Repository<EmergencyRiskLog>,
    @InjectRepository(HealthDeteriorationTrend, 'profile')
    private trendRepo: Repository<HealthDeteriorationTrend>,
  ) { }

  async analyzeUserTrends(userProfileId: string) {
    const today = new Date();
    const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

    // 1. Activity Trends (Prompt 4)
    const metrics7d = await this.metricsRepo.find({
      where: { userProfileId, date: Between(sevenDaysAgo, today) },
    });
    const metrics30d = await this.metricsRepo.find({
      where: { userProfileId, date: Between(thirtyDaysAgo, today) },
    });

    const avgSteps7d = this.calculateAvg(metrics7d.map((m) => m.steps));
    const avgSteps30d = this.calculateAvg(metrics30d.map((m) => m.steps));
    const mobilityDecline =
      avgSteps30d > 0 ? (avgSteps30d - avgSteps7d) / avgSteps30d : 0;

    // 2. Medication Adherence (Prompt 4)
    const medLogs7d = await this.medLogsRepo.find({
      where: {
        medication: { userProfileId },
        scheduledTime: Between(sevenDaysAgo, today),
      },
    });
    const medLogs30d = await this.medLogsRepo.find({
      where: {
        medication: { userProfileId },
        scheduledTime: Between(thirtyDaysAgo, today),
      },
    });

    const missRate7d = this.calculateMissRate(medLogs7d);
    const missRate30d = this.calculateMissRate(medLogs30d);
    const adherenceDecline = missRate7d - missRate30d; // Positive means more misses lately

    // 3. Emergency Risk Stability (Prompt 4)
    const risks7d = await this.riskLogsRepo.find({
      where: { userProfileId, createdAt: Between(sevenDaysAgo, today) },
    });
    const avgRisk7d = this.calculateAvg(risks7d.map((r) => r.riskScore));

    // 4. Feature Definition Logic (Prompt 4)
    const trendScore = this.calculateDeteriorationScore({
      mobilityDecline,
      adherenceDecline,
      avgRisk7d,
    });

    // 5. Save Trend
    const trend = this.trendRepo.create({
      userProfileId,
      assessmentDate: today,
      deteriorationScore: trendScore,
      aggregates: {
        physical: {
          steps7dAvg: avgSteps7d,
          steps30dAvg: avgSteps30d,
          stepsDelta: mobilityDecline,
        },
        vitals: {
          hr7dAvg: 0,
          hrBaseline: 0,
          hrDelta: 0,
          spo27dAvg: 0,
          spo2Baseline: 0,
        }, // Placeholder
        adherence: {
          medMissRate7d: missRate7d,
          medMissRate30d: missRate30d,
          adherenceTrend: adherenceDecline > 0.05 ? 'declining' : 'stable',
        },
        emergency: { risk7dAvg: avgRisk7d, risk30dAvg: 0, riskSlope: 0 },
      },
      trendSummary: this.generateSummary(
        mobilityDecline,
        adherenceDecline,
        trendScore,
      ),
    });

    return await this.trendRepo.save(trend);
  }

  private calculateAvg(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  private calculateMissRate(logs: MedicationLog[]): number {
    if (logs.length === 0) return 0;
    const missed = logs.filter(
      (l) =>
        l.status === MedicationLogStatus.MISSED ||
        l.status === MedicationLogStatus.SKIPPED,
    ).length;
    return missed / logs.length;
  }

  private calculateDeteriorationScore(features: any): number {
    // Prompt 6: Risk Scoring logic
    let score = 0;
    if (features.mobilityDecline > 0.15) score += 30; // 15% decline in steps
    if (features.adherenceDecline > 0.1) score += 40; // 10% increase in missed meds
    if (features.avgRisk7d > 0.5) score += 30; // High average emergency risk

    return Math.min(100, score);
  }

  private generateSummary(mob: number, adh: number, score: number): string {
    if (score < 20) return 'Global health status is stable.';
    const issues: string[] = [];
    if (mob > 0.1) issues.push('gradual decline in physical activity');
    if (adh > 0.05) issues.push('increasing medication irregularities');
    return `Signs of ${issues.join(' and ')}. Deterioration risk at ${score}%.`;
  }
}

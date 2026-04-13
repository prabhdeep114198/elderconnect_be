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
import { AiEngineService } from '../../ai/ai-engine.service';

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
    private aiEngine: AiEngineService,
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

    // 3. Vitals Trends (Prompt 4)
    const avgHR7d = this.calculateAvg(metrics7d.map(m => m.heartRate).filter(v => !!v));
    const avgHR30d = this.calculateAvg(metrics30d.map(m => m.heartRate).filter(v => !!v));
    const hrDelta = avgHR30d > 0 ? (avgHR7d - avgHR30d) / avgHR30d : 0;

    const avgSPO27d = this.calculateAvg(metrics7d.map(m => m.oxygenSaturation).filter(v => !!v));
    const avgSPO230d = this.calculateAvg(metrics30d.map(m => m.oxygenSaturation).filter(v => !!v));

    // 4. Emergency Risk Stability (Prompt 4)
    const risks7d = await this.riskLogsRepo.find({
      where: { userProfileId, createdAt: Between(sevenDaysAgo, today) },
    });
    const avgRisk7d = this.calculateAvg(risks7d.map((r) => r.riskScore));

    // 5. Feature Definition Logic (Prompt 4)
    const trendScore = this.calculateDeteriorationScore({
      mobilityDecline,
      adherenceDecline,
      avgRisk7d,
      hrDelta
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
          hr7dAvg: avgHR7d,
          hrBaseline: avgHR30d,
          hrDelta: hrDelta,
          spo27dAvg: avgSPO27d,
          spo2Baseline: avgSPO230d,
        },
        adherence: {
          medMissRate7d: missRate7d,
          medMissRate30d: missRate30d,
          adherenceTrend: adherenceDecline > 0.05 ? 'declining' : 'stable',
        },
        emergency: { risk7dAvg: avgRisk7d, risk30dAvg: 0, riskSlope: 0 },
      },
      trendSummary: "Analyzing...", // Placeholder for AI
    });

    const savedTrend = await this.trendRepo.save(trend);

    // 6. Generate AI Summary asynchronously (or synchronously here for simple result)
    savedTrend.trendSummary = await this.generateAiSummary(savedTrend);
    return await this.trendRepo.save(savedTrend);
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

  private async generateAiSummary(trend: HealthDeteriorationTrend): Promise<string> {
    const systemPrompt = `You are a longevity and geriatric specialist.
Analyze the provided 7-day vs 30-day health trends for an elderly user.
Write a 2-sentence summary of their "Health Trajectory".
Be clinical yet empathetic. Use 'we' (e.g., 'We are seeing...').`;

    const userMessage = `
Deterioration Score: ${trend.deteriorationScore}/100
Activity: 7d Avg ${trend.aggregates.physical.steps7dAvg} vs 30d Baseline ${trend.aggregates.physical.steps30dAvg}.
Medication Miss Rate: 7d ${trend.aggregates.adherence.medMissRate7d} vs 30d ${trend.aggregates.adherence.medMissRate30d}.
Vitals: HR Delta ${trend.aggregates.vitals.hrDelta.toFixed(2)}.`;

    try {
      const response = await this.aiEngine.generateStructuredResponse(systemPrompt, userMessage);
      return response.summary || response.analysis || "Health status is mostly stable with minor fluctuations.";
    } catch (err) {
      this.logger.error(`AI Trend summary failed: ${err.message}`);
      return "Health status shows some signs of change; maintaining current care plan is advised.";
    }
  }
}

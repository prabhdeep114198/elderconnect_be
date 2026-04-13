import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DailyHealthMetric } from '../entities/daily-health-metric.entity';
import { Between } from 'typeorm';
import { AiEngineService } from '../../ai/ai-engine.service';
import {
  EmergencyRiskLog,
  EmergencyRiskLevel,
} from '../entities/emergency-risk-log.entity';
import { NotificationService } from '../../notification/notification.service';
import {
  NotificationType,
  NotificationCategory,
} from '../../notification/entities/notification.entity';
import { AlertPriority } from '../../common/enums/user-role.enum';
import { UserProfile } from '../entities/user-profile.entity';

@Injectable()
export class EmergencyPredictionService {
  private readonly logger = new Logger(EmergencyPredictionService.name);

  constructor(
    @InjectRepository(EmergencyRiskLog, 'profile')
    private readonly riskLogRepository: Repository<EmergencyRiskLog>,
    @InjectRepository(DailyHealthMetric, 'profile')
    private readonly healthMetricRepository: Repository<DailyHealthMetric>,
    private readonly notificationService: NotificationService,
    private readonly aiEngine: AiEngineService,
  ) { }

  /**
   * Main Entry Point: Called when new vitals are logged.
   */
  async evaluateEmergencyRisk(metric: DailyHealthMetric): Promise<void> {
    this.logger.log(
      `Evaluating Emergency Risk for User ${metric.userProfileId}`,
    );

    // 1. Fetch historical context (last 24 hours) for AI comparison
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    const history = await this.healthMetricRepository.find({
      where: { 
        userProfileId: metric.userProfileId,
        date: Between(yesterday, new Date())
      },
      order: { date: 'DESC' },
      take: 24,
    });

    // 2. Feature Engineering
    const features = this.extractFeatures(metric);

    // 3. AI-Driven Inference (Anomaly & Forecast)
    const anomalyResult = await this.detectAnomalies(features, history);
    const forecastResult = await this.forecastEmergency(features, history);

    const anomalyScore = anomalyResult.score;
    const forecastProbability = forecastResult.probability;

    // 4. Combined Risk Scoring
    const riskScore = anomalyScore * 0.4 + forecastProbability * 0.6;
    const riskLevel = this.determineRiskLevel(riskScore);

    this.logger.log(
      `Risk Assessment: Score=${riskScore.toFixed(2)}, Level=${riskLevel}`,
    );

    // 4. Log the Risk
    const log = this.riskLogRepository.create({
      userProfileId: metric.userProfileId,
      riskScore,
      riskLevel,
      factors: {
        anomalyScore,
        forecastProbability,
        adherencePenalty: 0,
        vitalSpikes: features.spikes,
        aiReasoning: anomalyResult.reasoning || forecastResult.reasoning
      },
      alertSent: false,
    });

    // 5. Alert & Escalation Rules - Prompt 8
    if (
      riskLevel === EmergencyRiskLevel.CRITICAL ||
      riskLevel === EmergencyRiskLevel.HIGH
    ) {
      await this.triggerEmergencyEscalation(metric, log);
      log.alertSent = true;
    } else if (riskLevel === EmergencyRiskLevel.MEDIUM) {
      await this.triggerPreAlert(metric);
      log.alertSent = true;
    }

    await this.riskLogRepository.save(log);
  }

  private extractFeatures(metric: DailyHealthMetric) {
    // Prompt 4: Feature Logic
    const spikes: string[] = [];
    if (metric.heartRate && metric.heartRate > 110) spikes.push('HR_SPIKE');
    if (metric.oxygenSaturation && metric.oxygenSaturation < 92)
      spikes.push('O2_DROP');

    return {
      heartRate: metric.heartRate,
      o2: metric.oxygenSaturation,
      spikes,
    };
  }

  /**
   * AI Anomaly Detection: Checks if current vitals are abnormal for this specific user.
   */
  private async detectAnomalies(features: any, history: DailyHealthMetric[]): Promise<{ score: number, reasoning: string }> {
    const systemPrompt = `You are a clinical anomaly detection agent. 
Analyze the current vitals in the context of the user's recent history.
Return a JSON object with: 
- score: 0.0 to 1.0 (1.0 = highly abnormal/dangerous)
- reasoning: brief explanation.`;

    const userMessage = `
Current Vitals: HR ${features.heartRate}, O2 ${features.o2}%. 
History (last 24h): ${history.map(h => `HR:${h.heartRate}/O2:${h.oxygenSaturation}`).join(', ')}.
Spikes detected: ${features.spikes.join(', ')}.`;

    try {
      const response = await this.aiEngine.generateStructuredResponse(systemPrompt, userMessage);
      return { 
        score: parseFloat(response.score) || 0, 
        reasoning: response.reasoning || "Consistent with trends." 
      };
    } catch (err) {
      this.logger.error(`AI Anomaly detection failed: ${err.message}`);
      return { score: features.spikes.length > 0 ? 0.7 : 0.1, reasoning: "Fallback logic used." };
    }
  }

  /**
   * AI Emergency Forecast: Predicts the likelihood of an acute event in the next 12 hours.
   */
  private async forecastEmergency(features: any, history: DailyHealthMetric[]): Promise<{ probability: number, reasoning: string }> {
    const systemPrompt = `You are a predictive healthcare agent.
Estimate the probability of a health emergency in the next 12 hours based on data trends.
Return JSON:
- probability: 0.0 to 1.0
- reasoning: brief clinical explanation.`;

    const userMessage = `
Vitals: HR ${features.heartRate}, O2 ${features.o2}%. 
Trend Data: ${history.length} recent data points.
Signs of instability: ${features.spikes.length > 0 ? 'Yes' : 'No'}.`;

    try {
      const response = await this.aiEngine.generateStructuredResponse(systemPrompt, userMessage);
      return { 
        probability: parseFloat(response.probability) || 0, 
        reasoning: response.reasoning || "Stable forecast." 
      };
    } catch (err) {
      this.logger.error(`AI Emergency forecast failed: ${err.message}`);
      return { probability: features.o2 < 90 ? 0.8 : 0.2, reasoning: "Fallback logic used." };
    }
  }

  /**
   * Prompt 7: Risk Threshold Logic
   */
  private determineRiskLevel(score: number): EmergencyRiskLevel {
    if (score >= 0.85) return EmergencyRiskLevel.CRITICAL;
    if (score >= 0.7) return EmergencyRiskLevel.HIGH;
    if (score >= 0.5) return EmergencyRiskLevel.MEDIUM;
    return EmergencyRiskLevel.LOW;
  }

  /**
   * Prompt 8: SOS Escalation
   */
  private async triggerEmergencyEscalation(
    metric: DailyHealthMetric,
    log: EmergencyRiskLog,
  ) {
    // Need to fetch user to get emergency contact
    // ideally we would eager load this or fetch distinct
    const user = await this.riskLogRepository.manager.findOne(UserProfile, {
      where: { id: metric.userProfileId },
    });

    if (user && user.emergencyContactPhone) {
      this.logger.warn(`TRIGGERING SOS for User ${user.userId}`);
      await this.notificationService.createNotification({
        userId: user.userId,
        recipient: user.emergencyContactPhone,
        type: NotificationType.SMS, // Or VOICE_CALL
        category: NotificationCategory.SOS_ALERT,
        title: 'URGENT: Health Anomaly Detected',
        message: `ElderConnect AI detected high risk of health emergency for ${user.userId}. Risk Score: ${log.riskScore.toFixed(2)}. Please check on them immediately.`,
        priority: AlertPriority.CRITICAL,
      });
    }
  }

  /**
   * Prompt 8: Pre-Alert
   */
  private async triggerPreAlert(metric: DailyHealthMetric) {
    await this.notificationService.createNotification({
      userId: metric.userProfileId,
      type: NotificationType.PUSH,
      category: NotificationCategory.HEALTH_ALERT,
      title: 'Health Check-in',
      message: 'We noticed some unusual vitals. Are you feeling okay?',
      priority: AlertPriority.HIGH,
    });
  }
}

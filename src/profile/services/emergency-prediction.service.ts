import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DailyHealthMetric } from '../entities/daily-health-metric.entity';
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
  ) { }

  /**
   * Main Entry Point: Called when new vitals are logged.
   */
  async evaluateEmergencyRisk(metric: DailyHealthMetric): Promise<void> {
    this.logger.log(
      `Evaluating Emergency Risk for User ${metric.userProfileId}`,
    );

    // 1. Feature Engineering (Windowing) - Prompt 3 & 4
    // In a real app, we would fetch the last 24h of data here.
    // const history = await this.healthMetricRepository.find(...)
    const features = this.extractFeatures(metric);

    // 2. ML Inference (Anomaly & Forecast) - Prompt 5 & 6
    const anomalyScore = await this.detectAnomalies(features);
    const forecastProbability = await this.forecastEmergency(features);

    // 3. Risk Scoring - Prompt 7
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
        adherencePenalty: 0, // Todo: integration
        vitalSpikes: features.spikes,
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
   * Prompt 5: Anomaly Detection Model (Stub)
   * Real implementation would call Python Microservice (Isolation Forest)
   */
  private async detectAnomalies(features: any): Promise<number> {
    // Mock logic: High deviation = High Anomaly Score
    if (features.spikes.length > 0) return 0.8 + Math.random() * 0.2;
    return Math.random() * 0.3;
  }

  /**
   * Prompt 6: Emergency Forecasting Model (Stub)
   * Real implementation would call Python Microservice (LSTM)
   */
  private async forecastEmergency(features: any): Promise<number> {
    // Mock logic
    if (features.o2 < 90) return 0.9;
    return Math.random() * 0.4;
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

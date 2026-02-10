import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MedicationLog } from '../entities/medication-log.entity';
import { Medication } from '../entities/medication.entity';
import { DailyHealthMetric } from '../entities/daily-health-metric.entity';
import {
  ReminderLog,
  ReminderMethod,
  ReminderAction,
} from '../entities/reminder-log.entity';
import { UserProfile } from '../entities/user-profile.entity';
import { NotificationService } from '../../notification/notification.service';
import {
  NotificationType,
  NotificationCategory,
} from '../../notification/entities/notification.entity';
import { AlertPriority } from '../../common/enums/user-role.enum';

@Injectable()
export class IntelligenceService {
  private readonly logger = new Logger(IntelligenceService.name);

  constructor(
    @InjectRepository(ReminderLog, 'profile')
    private readonly reminderLogRepository: Repository<ReminderLog>,
    @InjectRepository(MedicationLog, 'profile')
    private readonly medicationLogRepository: Repository<MedicationLog>,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Main entry point for analyzing a medication event (e.g., missed dose or upcoming schedule)
   */
  async analyzeAdherenceRisk(medicationLogId: string): Promise<void> {
    this.logger.log(`Analyzing adherence risk for log ${medicationLogId}`);

    const medicationLog = await this.medicationLogRepository.findOne({
      where: { id: medicationLogId },
      relations: ['medication', 'medication.userProfile'],
    });

    if (!medicationLog) {
      this.logger.warn(`MedicationLog ${medicationLogId} not found`);
      return;
    }

    // 1. Get Miss Probability Score (Mocked ML Model Call)
    const missProbability = await this.predictMissProbability(medicationLog);

    // 2. Determine Criticality (Based on medication notes/condition for now, or future criticality field)
    const isCritical = this.checkCriticality(medicationLog.medication);

    // 3. Rules Engine Decision
    await this.applyInterventionRules(
      medicationLog,
      missProbability,
      isCritical,
    );
  }

  /**
   * MOCK: Calls Python Microservice for Miss Probability Prediction
   * Inputs: Time of day, History, Vitals (TODO)
   */
  private async predictMissProbability(log: MedicationLog): Promise<number> {
    // TODO: HTTP Call to Python Service
    // POST /predict/miss-probability

    // Fallback/Mock Logic:
    // Higher probability if dosage is high frequency or historical adherence is low
    // For now, return random score for simulation
    return Math.random();
  }

  /**
   * Heuristic for medication criticality
   */
  private checkCriticality(medication: Medication): boolean {
    const criticalKeywords = [
      'heart',
      'blood pressure',
      'seizure',
      'insulin',
      'diabetes',
    ];
    if (!medication.condition) return false;
    return criticalKeywords.some((keyword) =>
      medication.condition.toLowerCase().includes(keyword),
    );
  }

  /**
   * Decision Layer: Determines whether to alert User, Caregiver, or Snooze
   */
  private async applyInterventionRules(
    log: MedicationLog,
    probability: number,
    isCritical: boolean,
  ): Promise<void> {
    this.logger.log(
      `Applying rules: Prob=${probability.toFixed(2)}, Critical=${isCritical}`,
    );

    if (probability > 0.8 && isCritical) {
      await this.logReminder(
        log,
        ReminderMethod.CAREGIVER_ALERT,
        probability,
        'High risk missed dose',
      );

      // Trigger Caregiver Alert
      const user = log.medication.userProfile;
      if (user && user.emergencyContactPhone) {
        await this.notificationService.createNotification({
          userId: user.userId, // Alerting context of user
          recipient: user.emergencyContactPhone,
          type: NotificationType.SMS,
          category: NotificationCategory.SOS_ALERT,
          title: `Critical Medication Alert: ${user.userId}`,
          message: `User failed to take critical medication ${log.medication.name}. Risk Score: ${probability.toFixed(2)}`,
          priority: AlertPriority.CRITICAL,
        });
      }
    } else if (probability > 0.6) {
      await this.logReminder(
        log,
        ReminderMethod.NOTIFICATION,
        probability,
        'Early dynamic reminder',
      );

      // Trigger User Reminder
      const user = log.medication.userProfile;
      if (user) {
        await this.notificationService.createNotification({
          userId: user.userId,
          type: NotificationType.PUSH,
          category: NotificationCategory.MEDICATION_REMINDER,
          title: `Time to take ${log.medication.name}`,
          message: `Adherence Insight: Taking this now keeps your streak!`,
          priority: AlertPriority.HIGH,
          data: { medicationId: log.medication.id },
        });
      }
    } else {
      this.logger.log('Risk low, no intervention needed yet.');
    }
  }

  /**
   * Optimizes reminder timing using RL Agent (Mocked)
   */
  async getOptimalReminderTime(medicationLogId: string): Promise<Date> {
    // TODO: Call Python RL Agent
    // GET /predict/optimal-time
    return new Date(); // Return current time as default
  }

  private async logReminder(
    log: MedicationLog,
    method: ReminderMethod,
    score: number,
    note: string,
  ) {
    const reminder = this.reminderLogRepository.create({
      medicationLog: log,
      sentAt: new Date(),
      method: method,
      missProbabilityScore: score,
      isDynamic: true, // simplified for now
    });
    await this.reminderLogRepository.save(reminder);
    this.logger.log(`Reminder logged: ${method} for ${log.id} (${note})`);
  }

  /**
   * Analyzes health metrics for potential adverse reactions to medications
   */
  async analyzeAdverseReaction(metric: DailyHealthMetric): Promise<void> {
    this.logger.log(
      `Analyzing health metric for adverse reactions: User ${metric.userProfileId}`,
    );

    // 1. Fetch recent medications (last 24h)
    const recentLogs = await this.medicationLogRepository.find({
      where: {
        medication: { userProfileId: metric.userProfileId },
        // schedule logic omitted for brevity in MVP
      },
      relations: ['medication', 'medication.userProfile'],
      take: 5,
    });

    // 2. Check for Correlations (Mocked ML Call)
    const riskAnalysis = await this.detectCorrelations(metric, recentLogs);

    if (riskAnalysis.riskLevel === 'HIGH') {
      this.logger.warn(
        `Potential Adverse Reaction detected: ${riskAnalysis.reason}`,
      );

      // Alert Doctor Dashboard (Passive) / Caregiver
      await this.notificationService.createNotification({
        userId: metric.userProfileId,
        type: NotificationType.PUSH,
        category: NotificationCategory.HEALTH_ALERT,
        title: `Health Insight`,
        message: `We noticed a change in vitals (${riskAnalysis.reason}). Please share this with your doctor.`,
        priority: AlertPriority.MEDIUM,
        data: { metricId: metric.id, reason: riskAnalysis.reason },
      });
    }
  }

  private async detectCorrelations(
    metric: DailyHealthMetric,
    recentLogs: MedicationLog[],
  ): Promise<{ riskLevel: 'LOW' | 'MEDIUM' | 'HIGH'; reason?: string }> {
    // TODO: Call Python Service: POST /predict/adverse-reaction

    // Simple Heuristics for MVP:
    // High Heart Rate (> 120) after taking medication
    if (metric.heartRate && metric.heartRate > 120 && recentLogs.length > 0) {
      return {
        riskLevel: 'HIGH',
        reason: 'Elevated Heart Rate post-medication',
      };
    }

    // Low Sleep (< 4h)
    if (metric.sleepHours && metric.sleepHours < 4) {
      return { riskLevel: 'MEDIUM', reason: 'Poor sleep pattern detected' };
    }

    return { riskLevel: 'LOW' };
  }
}

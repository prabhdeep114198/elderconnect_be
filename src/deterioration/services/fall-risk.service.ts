import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { FallRiskAssessment, RiskTrend } from '../entities/fall-risk-assessment.entity';
import { DailyHealthMetric } from '../../profile/entities/daily-health-metric.entity';
import { SensorData } from '../../device/entities/sensor-data.entity';
import { MedicationLog, MedicationLogStatus } from '../../profile/entities/medication-log.entity';
import { NotificationService } from '../../notification/notification.service';
import { NotificationType, NotificationCategory } from '../../notification/entities/notification.entity';
import { AlertPriority } from '../../common/enums/user-role.enum';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class FallRiskService {
    private readonly logger = new Logger(FallRiskService.name);
    private readonly mlEngineUrl: string;

    constructor(
        @InjectRepository(FallRiskAssessment, 'profile')
        private readonly riskRepo: Repository<FallRiskAssessment>,
        @InjectRepository(DailyHealthMetric, 'profile')
        private readonly metricsRepo: Repository<DailyHealthMetric>,
        @InjectRepository(SensorData, 'vitals')
        private readonly sensorRepo: Repository<SensorData>,
        @InjectRepository(MedicationLog, 'profile')
        private readonly medLogRepo: Repository<MedicationLog>,
        private readonly notificationService: NotificationService,
        private readonly configService: ConfigService,
    ) {
        this.mlEngineUrl = this.configService.get('ML_ENGINE_URL') || 'http://ml-engine:8000';
    }

    async recalculateRisk(userId: string) {
        this.logger.log(`Recalculating Fall Risk for user ${userId}`);

        try {
            const features = await this.gatherLstmFeatures(userId);
            const historyScores = await this.getRecentRiskScores(userId);

            const response = await axios.post(`${this.mlEngineUrl}/predict`, {
                userId,
                historical_data: features,
                daily_scores: historyScores,
            });

            const prediction = response.data;

            const assessment = this.riskRepo.create({
                userId,
                currentRiskScore: prediction.current_risk,
                forecast7d: prediction.forecast_7d,
                forecast30d: prediction.forecast_30d,
                forecast90d: prediction.forecast_90d,
                trend: prediction.risk_trend as RiskTrend,
                confidenceInterval: prediction.confidence_interval,
                recommendations: prediction.recommendations,
                isSpike: prediction.spike_detected,
                calculationDate: new Date(),
            });

            const saved = await this.riskRepo.save(assessment);
            await this.evaluateAlerts(userId, saved);
            return saved;
        } catch (error) {
            this.logger.error(`Error in Fall Risk calculation: ${error.message}`);
            throw error;
        }
    }

    private async gatherLstmFeatures(userId: string) {
        const today = new Date();
        const startDate = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

        const [metrics, sensors, medLogs] = await Promise.all([
            this.metricsRepo.find({ where: { userProfileId: userId, date: Between(startDate, today) }, order: { date: 'ASC' } }),
            this.sensorRepo.find({ where: { userId, timestamp: Between(startDate, today) }, order: { timestamp: 'ASC' } }),
            this.medLogRepo.find({ where: { medication: { userProfileId: userId }, scheduledTime: Between(startDate, today) }, relations: ['medication'] })
        ]);

        const dailyWindows: any[] = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
            const dStr = d.toISOString().split('T')[0];

            const dayMetric = metrics.find(m => m.date.toISOString().split('T')[0] === dStr);
            const daySensors = sensors.filter(s => s.timestamp.toISOString().split('T')[0] === dStr);
            const dayMeds = medLogs.filter(l => l.scheduledTime.toISOString().split('T')[0] === dStr);

            dailyWindows.push({
                gait_speed_var: dayMetric?.steps ? Math.random() * 0.2 : 0,
                balance_score: 80,
                daily_steps: dayMetric?.steps || 0,
                prev_fall_history: 0,
                med_adherence: this.calculateAdherence(dayMeds),
                sedative_flag: dayMeds.some(m => m.medication.notes?.toLowerCase().includes('sedative')) ? 1 : 0,
                motion_sensor_freq: daySensors.filter(s => s.sensorType === 'motion').length,
                pressure_mat_imbalance: 0.1
            });
        }

        return dailyWindows;
    }

    private calculateAdherence(logs: MedicationLog[]): number {
        if (logs.length === 0) return 1.0;
        const taken = logs.filter(l => l.status === MedicationLogStatus.TAKEN).length;
        return taken / logs.length;
    }

    private async getRecentRiskScores(userId: string): Promise<number[]> {
        const past = await this.riskRepo.find({
            where: { userId },
            order: { createdAt: 'DESC' },
            take: 30
        });
        return past.map(p => p.currentRiskScore).reverse();
    }

    async getRiskHistory(userId: string) {
        return this.riskRepo.find({
            where: { userId },
            order: { createdAt: 'DESC' },
            take: 30,
        });
    }

    private async evaluateAlerts(userId: string, assessment: FallRiskAssessment) {
        const config = { highThreshold: 70 };
        let shouldAlert = false;
        let reason = '';

        if (assessment.currentRiskScore > config.highThreshold) {
            shouldAlert = true;
            reason = `High Fall Risk Detected (${assessment.currentRiskScore.toFixed(0)}%)`;
        } else if (assessment.isSpike) {
            shouldAlert = true;
            reason = `Rapid Increase in Fall Risk Detected`;
        }

        if (shouldAlert) {
            await this.notificationService.createNotification({
                userId,
                type: NotificationType.PUSH,
                category: NotificationCategory.HEALTH_ALERT,
                title: 'Fall Risk Alert',
                message: `${reason}. Please view recommendations in the dashboard.`,
                priority: AlertPriority.HIGH
            });

            const profile = await this.metricsRepo.manager.findOne('UserProfile', { where: { userId } }) as any;
            if (profile?.emergencyContactPhone) {
                await this.notificationService.createNotification({
                    userId,
                    recipient: profile.emergencyContactPhone,
                    type: NotificationType.SMS,
                    category: NotificationCategory.SOS_ALERT,
                    title: 'Caregiver Alert: Fall Risk Warning',
                    message: `ElderConnect Alert for ${profile.emergencyContactName || 'your loved one'}: ${reason}.`,
                    priority: AlertPriority.CRITICAL
                });
            }
        }
    }
}

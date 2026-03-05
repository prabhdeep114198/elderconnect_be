import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserProfile } from '../profile/entities/user-profile.entity';
import { DailyHealthMetric } from '../profile/entities/daily-health-metric.entity';
import { SOSAlert } from '../device/entities/sos-alert.entity';
import { ProfileService } from '../profile/profile.service';
import { AlertPriority } from '../common/enums/user-role.enum';

@Injectable()
export class FallRiskService {
    private readonly logger = new Logger(FallRiskService.name);

    constructor(
        @InjectRepository(UserProfile, 'profile')
        private readonly profileRepository: Repository<UserProfile>,
        @InjectRepository(DailyHealthMetric, 'profile')
        private readonly metricRepository: Repository<DailyHealthMetric>,
        @InjectRepository(SOSAlert, 'vitals')
        private readonly sosRepository: Repository<SOSAlert>,
        private readonly profileService: ProfileService,
    ) { }

    async getAnalysis(userId: string) {
        const profile = await this.profileRepository.findOne({ where: { userId } });
        const metrics = await this.metricRepository.find({
            where: { userProfileId: profile?.id },
            order: { date: 'DESC' },
            take: 30,
        });

        // Simple heuristic for fall risk
        let score = 25.0; // base score out of 100

        if (profile) {
            if (profile.age && profile.age > 75) score += 20;
            if (profile.bmi && (profile.bmi > 30 || profile.bmi < 18)) score += 10;

            const balanceIssues = profile.medicalConditions?.some(c =>
                ['arthritis', 'vertigo', 'dizziness', 'parkinson'].includes(c.toLowerCase())
            );
            if (balanceIssues) score += 30;
        }

        if (metrics.length > 0) {
            const avgSteps = metrics.reduce((sum, m) => sum + m.steps, 0) / metrics.length;
            if (avgSteps < 1000) score += 20;
            else if (avgSteps < 3000) score += 10;
        }

        const historicalData = metrics.map(m => {
            let dayScore = 15.0; // Lower baseline for healthy individuals

            // Add risks from static profile elements
            if (profile) {
                if (profile.age && profile.age > 75) dayScore += 10;
                if (profile.bmi && (profile.bmi > 30 || profile.bmi < 18)) dayScore += 5;
                const balanceIssues = profile.medicalConditions?.some(c =>
                    ['arthritis', 'vertigo', 'dizziness', 'parkinson'].includes(c.toLowerCase())
                );
                if (balanceIssues) dayScore += 15;
            }

            // Variable daily risk based on metrics
            if (m.steps < 1500) dayScore += 25;
            else if (m.steps < 3000) dayScore += 15;
            else if (m.steps < 5000) dayScore += 5;
            else if (m.steps >= 7000) dayScore -= 10; // active day significantly reduces risk

            if (m.sleepHours < 5) dayScore += 15;
            else if (m.sleepHours < 6.5) dayScore += 5;
            else if (m.sleepHours >= 7) dayScore -= 5; // good sleep reduces risk

            if (m.heartRate > 100 || m.heartRate < 55) dayScore += 10;
            if (m.oxygenSaturation && m.oxygenSaturation < 95) dayScore += 10;

            // Extra bonus for an overall balanced/good day
            if (m.steps >= 6000 && m.sleepHours >= 7 && m.heartRate >= 60 && m.heartRate <= 90) {
                dayScore -= 15;
            }

            return {
                timestamp: new Date(m.date).toISOString(),
                score: Math.max(5, Math.min(95, dayScore)), // Bounds between 5 and 95
            };
        }).reverse();

        // Ensure we have a current score, default to base logic if no metrics
        let currentScore = score;
        if (historicalData.length > 0) {
            currentScore = historicalData[historicalData.length - 1].score;
        }

        return {
            currentScore: currentScore,
            lastUpdate: new Date().toISOString(),
            indicators: {
                gaitSpeedVar: 12, // mock
                activityLevel: metrics.length > 0 ? Math.min(100, (metrics[0].steps / 5000) * 100) : 0,
                medicationAdherence: 85, // mock
                recentFalls: 0, // mock
                environmentalRisk: 15, // mock
            },
            forecasts: [
                { days: 7, predictedScore: Math.max(5, currentScore - 2), confidenceInterval: [currentScore - 5, currentScore + 1], trend: 'down' as const },
                { days: 30, predictedScore: Math.max(5, currentScore - 5), confidenceInterval: [currentScore - 10, currentScore + 2], trend: 'down' as const },
            ],
            historicalData: historicalData,
        };
    }

    async getAlerts(userId: string) {
        const alerts = await this.sosRepository.find({
            where: { userId },
            order: { createdAt: 'DESC' },
            take: 5,
        });

        return alerts.map(a => ({
            id: a.id,
            type: a.priority === AlertPriority.CRITICAL || a.priority === AlertPriority.HIGH ? 'danger' as const : 'warning' as const,
            message: a.description,
            timestamp: new Date(a.createdAt).toISOString(),
            indicator: a.type,
        }));
    }

    async getRecommendations(userId: string) {
        const analysis = await this.getAnalysis(userId);
        const recommendations: any[] = [];

        if (analysis.currentScore > 40) {
            recommendations.push({
                id: '1',
                category: 'exercise',
                title: 'Daily Balance Exercises',
                description: 'Try 5 minutes of guided balance exercises from the app.',
                priority: analysis.currentScore > 70 ? 'high' : 'medium',
            });
        }

        recommendations.push({
            id: '2',
            category: 'environment',
            title: 'Lighting Check',
            description: 'Ensure hallways and bathrooms are well-lit during nighttime.',
            priority: 'low',
        });

        if (analysis.currentScore > 60) {
            recommendations.push({
                id: '3',
                category: 'medication',
                title: 'Review Medications',
                description: 'Some medications may cause dizziness. Consult your doctor.',
                priority: 'high',
            });
        }

        return recommendations;
    }

    async updateThreshold(userId: string, threshold: number) {
        const profile = await this.profileRepository.findOne({ where: { userId } });
        if (!profile) throw new Error('Profile not found');

        const preferences = profile.preferences || {};
        preferences.alertThreshold = threshold;
        profile.preferences = preferences;

        await this.profileRepository.save(profile);
    }
}

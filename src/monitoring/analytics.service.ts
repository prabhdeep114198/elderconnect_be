import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { format, subDays, subMonths, subWeeks, subYears } from 'date-fns';
import { Repository } from 'typeorm';
import { CacheService } from '../common/services/cache.service';
import { SOSAlert } from '../device/entities/sos-alert.entity';
import { TelemetryData } from '../device/entities/telemetry.entity';
import { MediaFile } from '../media/entities/media-file.entity';
import { Appointment } from '../profile/entities/appointment.entity';
import { DailyHealthMetric } from '../profile/entities/daily-health-metric.entity';
import { MedicationLog, MedicationLogStatus } from '../profile/entities/medication-log.entity';
import { Medication } from '../profile/entities/medication.entity';

import { AnalyticsQueryDto, TimeGranularity } from './dto/analytics-query.dto';

export interface HealthAnalytics {
    timeSeries: any[];
    statistics: any;
    trends: any;
    insights: string[];
}

@Injectable()
export class HealthAnalyticsService {
    private readonly logger = new Logger(HealthAnalyticsService.name);

    constructor(
        @InjectRepository(DailyHealthMetric, 'profile')
        private healthMetricRepository: Repository<DailyHealthMetric>,
        @InjectRepository(Appointment, 'profile')
        private appointmentRepository: Repository<Appointment>,
        @InjectRepository(Medication, 'profile')
        private medicationRepository: Repository<Medication>,

        @InjectRepository(MedicationLog, 'profile')
        private medicationLogRepository: Repository<MedicationLog>,
        @InjectRepository(MediaFile, 'media')
        private mediaFileRepository: Repository<MediaFile>,
        @InjectRepository(TelemetryData, 'vitals')
        private telemetryRepository: Repository<TelemetryData>,
        @InjectRepository(SOSAlert, 'vitals')
        private sosAlertRepository: Repository<SOSAlert>,
        private cacheService: CacheService,
    ) { }

    async seedData(userProfileId: string): Promise<any> {
        this.logger.log(`Seeding analytics data for user ${userProfileId}`);

        // Remove existing metrics for this user to avoid conflicts
        await this.healthMetricRepository.delete({ userProfileId });

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const metrics: DailyHealthMetric[] = [];
        for (let i = 0; i < 60; i++) {
            const date = subDays(today, i);

            const metric = this.healthMetricRepository.create({
                userProfileId,
                date,
                steps: Math.floor(Math.random() * 8000) + 2000,
                heartRate: Math.floor(Math.random() * 30) + 65,
                sleepHours: Math.floor(Math.random() * 4) + 6,
                waterIntake: Math.floor(Math.random() * 1000) + 1500,
            });
            metrics.push(metric);
        }

        await this.healthMetricRepository.save(metrics);
        this.logger.log(`Saved ${metrics.length} health metrics for profile ${userProfileId}`);

        // Seed some medication logs if none exist
        const medications = await this.medicationRepository.find({ where: { userProfileId } });
        if (medications.length > 0) {
            const logs: MedicationLog[] = [];
            for (const med of medications) {
                for (let i = 0; i < 20; i++) {
                    const scheduledTime = subDays(today, i);
                    scheduledTime.setHours(9, 0, 0, 0);

                    const log = this.medicationLogRepository.create({
                        medicationId: med.id,
                        scheduledTime,
                        actualTime: Math.random() > 0.1 ? new Date(scheduledTime.getTime() + Math.random() * 600000) : undefined,
                        status: Math.random() > 0.1 ? MedicationLogStatus.TAKEN : MedicationLogStatus.MISSED,
                        dosageTaken: med.dosage
                    });
                    logs.push(log);
                }
            }
            await this.medicationLogRepository.save(logs);
            this.logger.log(`Saved ${logs.length} medication logs for profile ${userProfileId}`);
        }

        this.logger.log(`Successfully completed seeding for user profile: ${userProfileId}`);

        // Clear cache for this user
        await this.cacheService.delPattern(`health_analytics:${userProfileId}*`);

        return {
            count: metrics.length,
            userProfileId
        };
    }

    async getHealthAnalytics(
        userId: string,
        userProfileId: string,
        query: AnalyticsQueryDto,
    ): Promise<any> {
        const cacheKey = `health_analytics:${userProfileId}:${Object.values(query).join('_')}`;

        // Try cache
        const cached = await this.cacheService.get<any>(cacheKey);
        if (cached) {
            this.logger.log(`Analytics CACHE HIT for profile ${userProfileId}`);
            return cached;
        }

        const { startDate, endDate } = this.getDateRange(query);
        this.logger.log(`Analytics request for profile: ${userProfileId}, range: ${startDate.toISOString()} to ${endDate.toISOString()}, granularity: ${query.granularity}`);

        const [timeSeries, statistics, medication, safety] = await Promise.all([
            this.getTimeSeriesData(userProfileId, startDate, endDate, query.granularity),
            this.getStatistics(userProfileId, startDate, endDate),
            this.getMedicationAdherence(userProfileId, startDate, endDate),
            this.getSafetyStatus(userId),
        ]);

        this.logger.log(`Analytics results: ${timeSeries.length} TS points, activeDays: ${statistics.activeDays}`);

        const trends = this.calculateTrends(timeSeries);
        const insights = this.generateInsights(statistics, trends);

        const result = {
            timeSeries,
            statistics,
            trends,
            insights,
            medication,
            safety,
            social: {
                engagementScore: 85, // Mocked for now
                trend: 'stable'
            }
        };

        // Cache for 5 minutes
        await this.cacheService.set(cacheKey, result, { ttl: 300 });

        return result;
    }

    async getWellnessProfile(userId: string, userProfileId: string): Promise<any> {
        const now = new Date();
        const thirtyDaysAgo = subDays(now, 30);

        const [stats, compliance] = await Promise.all([
            this.getStatistics(userProfileId, thirtyDaysAgo, now),
            this.getMedicationAdherence(userProfileId, thirtyDaysAgo, now),
        ]);

        // Calculate Scores (0-100 scale)
        const sleepScore = Math.min(100, Math.round((stats.sleep.avg / 8) * 100)) || 0;
        const exerciseScore = Math.min(100, Math.round((stats.steps.avg / 8000) * 100)) || 0;
        const dietScore = Math.min(100, Math.round((stats.water.avg / 2000) * 100)) || 0;
        const socialScore = 85;
        const mentalScore = stats.heartRate.avg > 60 && stats.heartRate.avg < 100 ? 80 : 60;
        const physicalScore = Math.round((sleepScore + exerciseScore + dietScore) / 3) || 70;

        return {
            physicalScore,
            mentalScore,
            sleepScore,
            socialScore,
            dietScore,
            exerciseScore,
            medicationAdherence: compliance.adherenceRate,
            activeDays: stats.activeDays,
            riskLevel: physicalScore < 50 ? 'high' : physicalScore < 75 ? 'medium' : 'low'
        };
    }

    private async getMedicationAdherence(userProfileId: string, startDate: Date, endDate: Date): Promise<any> {
        const logs = await this.medicationLogRepository
            .createQueryBuilder('log')
            .innerJoin('log.medication', 'medication')
            .where('medication.userProfileId = :userProfileId', { userProfileId })
            .andWhere('log.scheduledTime BETWEEN :startDate AND :endDate', { startDate, endDate })
            .getMany();

        if (logs.length === 0) return { adherenceRate: 100, total: 0, taken: 0 };

        const taken = logs.filter(l => l.status === MedicationLogStatus.TAKEN).length;
        const adherenceRate = Math.round((taken / logs.length) * 100);

        return {
            adherenceRate,
            total: logs.length,
            taken,
            missed: logs.length - taken
        };
    }

    private async getSafetyStatus(userId: string): Promise<any> {
        const latestAlert = await this.sosAlertRepository.findOne({
            where: { userId },
            order: { createdAt: 'DESC' }
        });

        if (!latestAlert) return { status: 'safe', lastAlert: null };

        const isRecent = new Date().getTime() - new Date(latestAlert.createdAt).getTime() < 24 * 60 * 60 * 1000;

        return {
            status: isRecent ? 'warning' : 'safe',
            lastAlert: latestAlert.createdAt
        };
    }

    private getDateRange(query: AnalyticsQueryDto): { startDate: Date; endDate: Date } {
        const endDate = query.endDate ? new Date(query.endDate) : new Date();
        let startDate: Date;

        if (query.startDate) {
            startDate = new Date(query.startDate);
        } else {
            const days = query.days || (query.granularity === TimeGranularity.DAY ? 7 : 30);
            switch (query.granularity) {
                case TimeGranularity.DAY:
                    startDate = subDays(endDate, days);
                    break;
                case TimeGranularity.WEEK:
                    startDate = subWeeks(endDate, days);
                    break;
                case TimeGranularity.MONTH:
                    startDate = subMonths(endDate, days);
                    break;
                case TimeGranularity.YEAR:
                    startDate = subYears(endDate, days);
                    break;
                default:
                    startDate = subDays(endDate, 30);
            }
        }

        startDate.setHours(0, 0, 0, 0);
        return { startDate, endDate };
    }

    private async getTimeSeriesData(
        userProfileId: string,
        startDate: Date,
        endDate: Date,
        granularity: TimeGranularity,
    ): Promise<any[]> {
        let dateFormat: string;
        let groupByClause: string;

        switch (granularity) {
            case TimeGranularity.DAY:
                dateFormat = 'yyyy-MM-dd';
                groupByClause = "DATE(date)";
                break;
            case TimeGranularity.WEEK:
                dateFormat = 'yyyy-ww';
                groupByClause = "DATE_TRUNC('week', date)";
                break;
            case TimeGranularity.MONTH:
                dateFormat = 'yyyy-MM';
                groupByClause = "DATE_TRUNC('month', date)";
                break;
            case TimeGranularity.YEAR:
                dateFormat = 'yyyy';
                groupByClause = "DATE_TRUNC('year', date)";
                break;
            default:
                dateFormat = 'yyyy-MM-dd';
                groupByClause = "DATE(date)";
        }

        const query = `
      SELECT 
        ${groupByClause} as period,
        AVG("heartRate")::numeric(10,2) as avg_heart_rate,
        MIN("heartRate") as min_heart_rate,
        MAX("heartRate") as max_heart_rate,
        AVG(steps)::numeric(10,2) as avg_steps,
        SUM(steps) as total_steps,
        AVG("sleepHours")::numeric(4,2) as avg_sleep,
        MIN("sleepHours") as min_sleep,
        MAX("sleepHours") as max_sleep,
        AVG("waterIntake")::numeric(10,2) as avg_water,
        COUNT(*) as measurement_count
      FROM daily_health_metrics
      WHERE "userProfileId" = $1
        AND date >= $2
        AND date <= $3
      GROUP BY ${groupByClause}
      ORDER BY period ASC
    `;

        const results = await this.healthMetricRepository.query(query, [
            userProfileId,
            startDate,
            endDate,
        ]);

        this.logger.log(`Found ${results.length} time series records for profile ${userProfileId}`);

        return results.map((row) => ({
            period: row.period instanceof Date ? format(row.period, dateFormat) : format(new Date(row.period), dateFormat),
            date: row.period,
            heartRate: {
                avg: parseFloat(row.avg_heart_rate || 0),
                min: parseInt(row.min_heart_rate || 0),
                max: parseInt(row.max_heart_rate || 0),
            },
            steps: {
                avg: parseFloat(row.avg_steps || 0),
                total: parseInt(row.total_steps || 0),
            },
            sleep: {
                avg: parseFloat(row.avg_sleep || 0),
                min: parseFloat(row.min_sleep || 0),
                max: parseFloat(row.max_sleep || 0),
            },
            water: {
                avg: parseFloat(row.avg_water || 0),
            },
            measurementCount: parseInt(row.measurement_count || 0),
        }));
    }

    private async getStatistics(
        userProfileId: string,
        startDate: Date,
        endDate: Date,
    ): Promise<any> {
        const query = `
      SELECT 
        AVG("heartRate")::numeric(10,2) as avg_heart_rate,
        MIN("heartRate") as min_heart_rate,
        MAX("heartRate") as max_heart_rate,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY "heartRate") as median_heart_rate,
        STDDEV("heartRate")::numeric(10,2) as stddev_heart_rate,
        
        AVG(steps)::numeric(10,2) as avg_steps,
        SUM(steps) as total_steps,
        MIN(steps) as min_steps,
        MAX(steps) as max_steps,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY steps) as median_steps,
        
        AVG("sleepHours")::numeric(4,2) as avg_sleep,
        MIN("sleepHours") as min_sleep,
        MAX("sleepHours") as max_sleep,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY "sleepHours") as median_sleep,
        
        AVG("waterIntake")::numeric(10,2) as avg_water,
        SUM("waterIntake") as total_water,
        
        COUNT(*) as total_measurements,
        COUNT(DISTINCT DATE(date)) as active_days
      FROM daily_health_metrics
      WHERE "userProfileId" = $1
        AND date >= $2
        AND date <= $3
    `;

        const [result] = await this.healthMetricRepository.query(query, [
            userProfileId,
            startDate,
            endDate,
        ]);

        return {
            heartRate: {
                avg: parseFloat(result.avg_heart_rate || 0),
                min: result.min_heart_rate,
                max: result.max_heart_rate,
                median: parseFloat(result.median_heart_rate || 0),
                stddev: parseFloat(result.stddev_heart_rate || 0),
            },
            steps: {
                avg: parseFloat(result.avg_steps || 0),
                total: parseInt(result.total_steps || 0),
                min: result.min_steps,
                max: result.max_steps,
                median: parseFloat(result.median_steps || 0),
            },
            sleep: {
                avg: parseFloat(result.avg_sleep || 0),
                min: parseFloat(result.min_sleep || 0),
                max: parseFloat(result.max_sleep || 0),
                median: parseFloat(result.median_sleep || 0),
            },
            water: {
                avg: parseFloat(result.avg_water || 0),
                total: parseFloat(result.total_water || 0),
            },
            activeDays: parseInt(result.active_days || 0),
            totalMeasurements: parseInt(result.total_measurements || 0),
        };
    }

    private calculateTrends(timeSeries: any[]): any {
        if (timeSeries.length < 2) {
            return {
                heartRate: { trend: 'stable', change: 0 },
                steps: { trend: 'stable', change: 0 },
                sleep: { trend: 'stable', change: 0 },
                water: { trend: 'stable', change: 0 },
            };
        }

        const calculateTrend = (data: number[]) => {
            const recent = data.slice(-7).reduce((a, b) => a + b, 0) / Math.max(1, Math.min(7, data.length));
            const previous = data.slice(0, -7).reduce((a, b) => a + b, 0) / Math.max(1, data.length - 7);

            if (previous === 0) return { trend: recent > 0 ? 'increasing' : 'stable', change: 0, recent, previous };

            const change = ((recent - previous) / previous) * 100;

            return {
                trend: change > 5 ? 'increasing' : change < -5 ? 'decreasing' : 'stable',
                change: parseFloat(change.toFixed(2)),
                recent: parseFloat(recent.toFixed(2)),
                previous: parseFloat(previous.toFixed(2)),
            };
        };

        return {
            heartRate: calculateTrend(timeSeries.map(d => d.heartRate.avg)),
            steps: calculateTrend(timeSeries.map(d => d.steps.avg)),
            sleep: calculateTrend(timeSeries.map(d => d.sleep.avg)),
            water: calculateTrend(timeSeries.map(d => d.water.avg)),
        };
    }

    private generateInsights(statistics: any, trends: any): string[] {
        const insights: string[] = [];

        // Heart rate insights
        if (statistics.heartRate.avg > 100) {
            insights.push('Your average heart rate is elevated. Consider consulting your doctor.');
        } else if (statistics.heartRate.avg < 60 && statistics.heartRate.avg > 0) {
            insights.push('You have a low resting heart rate, which may indicate good fitness.');
        }

        if (trends.heartRate.trend === 'increasing') {
            insights.push(`Your heart rate has increased by ${trends.heartRate.change}% recently.`);
        }

        // Steps insights
        if (statistics.steps.avg < 5000) {
            insights.push('Try to increase your daily steps. Aim for at least 7,000-10,000 steps.');
        } else if (statistics.steps.avg > 10000) {
            insights.push('Great job! You\'re exceeding the recommended daily steps.');
        }

        // Sleep insights
        if (statistics.sleep.avg < 7) {
            insights.push('You\'re not getting enough sleep. Aim for 7-9 hours per night.');
        } else if (statistics.sleep.avg > 9) {
            insights.push('You might be sleeping too much. Consider checking with your doctor.');
        }

        if (trends.sleep.trend === 'decreasing') {
            insights.push('Your sleep duration has been declining. Try to maintain a consistent sleep schedule.');
        }

        // Water intake insights
        if (statistics.water.avg < 2000) {
            insights.push('Increase your water intake. Aim for at least 2-3 liters per day.');
        }

        return insights;
    }

    async getComparativeAnalysis(
        userProfileId: string,
        period1Start: Date,
        period1End: Date,
        period2Start: Date,
        period2End: Date,
    ): Promise<any> {
        const [period1Stats, period2Stats] = await Promise.all([
            this.getStatistics(userProfileId, period1Start, period1End),
            this.getStatistics(userProfileId, period2Start, period2End),
        ]);

        const comparison = {
            heartRate: this.compareMetric(period1Stats.heartRate.avg, period2Stats.heartRate.avg),
            steps: this.compareMetric(period1Stats.steps.avg, period2Stats.steps.avg),
            sleep: this.compareMetric(period1Stats.sleep.avg, period2Stats.sleep.avg),
            water: this.compareMetric(period1Stats.water.avg, period2Stats.water.avg),
        };

        return {
            period1: period1Stats,
            period2: period2Stats,
            comparison,
        };
    }

    private compareMetric(value1: number, value2: number): any {
        const difference = value1 - value2;
        const percentChange = value2 !== 0 ? (difference / value2) * 100 : 0;

        return {
            difference: parseFloat(difference.toFixed(2)),
            percentChange: parseFloat(percentChange.toFixed(2)),
            trend: difference > 0 ? 'increased' : difference < 0 ? 'decreased' : 'stable',
        };
    }

    async getCorrelationAnalysis(userProfileId: string, days: number = 90): Promise<any> {
        const endDate = new Date();
        const startDate = subDays(endDate, days);

        const query = `
      SELECT 
        CORR("heartRate", steps)::numeric(4,3) as heart_rate_steps_corr,
        CORR("heartRate", "sleepHours")::numeric(4,3) as heart_rate_sleep_corr,
        CORR(steps, "sleepHours")::numeric(4,3) as steps_sleep_corr,
        CORR(steps, "waterIntake")::numeric(4,3) as steps_water_corr
      FROM daily_health_metrics
      WHERE "userProfileId" = $1
        AND date >= $2
        AND date <= $3
        AND "heartRate" IS NOT NULL
        AND steps IS NOT NULL
        AND "sleepHours" IS NOT NULL
    `;

        const [result] = await this.healthMetricRepository.query(query, [
            userProfileId,
            startDate,
            endDate,
        ]);

        return {
            correlations: {
                heartRateSteps: parseFloat(result.heart_rate_steps_corr || 0),
                heartRateSleep: parseFloat(result.heart_rate_sleep_corr || 0),
                stepsSleep: parseFloat(result.steps_sleep_corr || 0),
                stepsWater: parseFloat(result.steps_water_corr || 0),
            },
            interpretation: this.interpretCorrelations(result),
        };
    }

    private interpretCorrelations(correlations: any): string[] {
        const insights: string[] = [];

        const interpret = (value: number, metric1: string, metric2: string) => {
            const absValue = Math.abs(value);
            if (absValue > 0.7) {
                return `Strong ${value > 0 ? 'positive' : 'negative'} correlation between ${metric1} and ${metric2}`;
            } else if (absValue > 0.4) {
                return `Moderate ${value > 0 ? 'positive' : 'negative'} correlation between ${metric1} and ${metric2}`;
            } else if (absValue > 0.2) {
                return `Weak ${value > 0 ? 'positive' : 'negative'} correlation between ${metric1} and ${metric2}`;
            }
            return `No significant correlation between ${metric1} and ${metric2}`;
        };

        if (correlations.heart_rate_steps_corr) {
            insights.push(interpret(correlations.heart_rate_steps_corr, 'heart rate', 'steps'));
        }
        if (correlations.heart_rate_sleep_corr) {
            insights.push(interpret(correlations.heart_rate_sleep_corr, 'heart rate', 'sleep'));
        }
        if (correlations.steps_sleep_corr) {
            insights.push(interpret(correlations.steps_sleep_corr, 'steps', 'sleep'));
        }

        return insights;
    }
}

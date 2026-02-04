import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DailyHealthMetric } from '../profile/entities/daily-health-metric.entity';
import { Appointment } from '../profile/entities/appointment.entity';
import { MedicationLog } from '../profile/entities/medication-log.entity';
import { MediaFile } from '../media/entities/media-file.entity';
import { TelemetryData } from '../device/entities/telemetry.entity';
import { SOSAlert } from '../device/entities/sos-alert.entity';
import { AnalyticsQueryDto, TimeGranularity, MetricType } from './dto/analytics-query.dto';
import { subDays, subWeeks, subMonths, subYears, format } from 'date-fns';
import { CacheService } from '../common/services/cache.service';

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
        @InjectRepository(DailyHealthMetric)
        private healthMetricRepository: Repository<DailyHealthMetric>,
        @InjectRepository(Appointment)
        private appointmentRepository: Repository<Appointment>,
        @InjectRepository(MedicationLog)
        private medicationLogRepository: Repository<MedicationLog>,
        @InjectRepository(MediaFile)
        private mediaFileRepository: Repository<MediaFile>,
        @InjectRepository(TelemetryData)
        private telemetryRepository: Repository<TelemetryData>,
        @InjectRepository(SOSAlert)
        private sosAlertRepository: Repository<SOSAlert>,
        private cacheService: CacheService,
    ) { }

    async getHealthAnalytics(
        userProfileId: string,
        query: AnalyticsQueryDto,
    ): Promise<HealthAnalytics> {
        const cacheKey = `health_analytics:${userProfileId}:${JSON.stringify(query)}`;

        // Try cache
        const cached = await this.cacheService.get<HealthAnalytics>(cacheKey);
        if (cached) {
            return cached;
        }

        const { startDate, endDate } = this.getDateRange(query);

        const [timeSeries, statistics] = await Promise.all([
            this.getTimeSeriesData(userProfileId, startDate, endDate, query.granularity),
            this.getStatistics(userProfileId, startDate, endDate),
        ]);

        const trends = this.calculateTrends(timeSeries);
        const insights = this.generateInsights(statistics, trends);

        const result = {
            timeSeries,
            statistics,
            trends,
            insights,
        };

        // Cache for 5 minutes
        await this.cacheService.set(cacheKey, result, { ttl: 300 });

        return result;
    }

    private getDateRange(query: AnalyticsQueryDto): { startDate: Date; endDate: Date } {
        const endDate = query.endDate ? new Date(query.endDate) : new Date();
        let startDate: Date;

        if (query.startDate) {
            startDate = new Date(query.startDate);
        } else {
            switch (query.granularity) {
                case TimeGranularity.DAY:
                    startDate = subDays(endDate, query.days || 30);
                    break;
                case TimeGranularity.WEEK:
                    startDate = subWeeks(endDate, query.days || 12);
                    break;
                case TimeGranularity.MONTH:
                    startDate = subMonths(endDate, query.days || 12);
                    break;
                case TimeGranularity.YEAR:
                    startDate = subYears(endDate, query.days || 5);
                    break;
                default:
                    startDate = subDays(endDate, 30);
            }
        }

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
                dateFormat = 'yyyy-ww'; // Corrected format for ISO week
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
        AVG("waterIntake")::numeric(5,2) as avg_water,
        COUNT(*) as measurement_count,
        STDDEV("heartRate")::numeric(10,2) as stddev_heart_rate,
        STDDEV(steps)::numeric(10,2) as stddev_steps
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

        return results.map((row) => ({
            period: format(new Date(row.period), dateFormat),
            heartRate: {
                avg: parseFloat(row.avg_heart_rate || 0),
                min: row.min_heart_rate,
                max: row.max_heart_rate,
                stddev: parseFloat(row.stddev_heart_rate || 0),
            },
            steps: {
                avg: parseFloat(row.avg_steps || 0),
                total: parseInt(row.total_steps || 0),
                stddev: parseFloat(row.stddev_steps || 0),
            },
            sleep: {
                avg: parseFloat(row.avg_sleep || 0),
                min: parseFloat(row.min_sleep || 0),
                max: parseFloat(row.max_sleep || 0),
            },
            water: {
                avg: parseFloat(row.avg_water || 0),
            },
            measurementCount: parseInt(row.measurement_count),
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
        
        AVG("waterIntake")::numeric(5,2) as avg_water,
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
            const recent = data.slice(-7).reduce((a, b) => a + b, 0) / Math.min(7, data.length);
            const previous = data.slice(0, -7).reduce((a, b) => a + b, 0) / Math.max(1, data.length - 7);
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

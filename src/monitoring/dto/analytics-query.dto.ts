import { IsEnum, IsNumber, IsOptional, IsDateString } from 'class-validator';
import { Transform } from 'class-transformer';

export enum TimeGranularity {
    DAY = 'day',
    WEEK = 'week',
    MONTH = 'month',
    YEAR = 'year',
}

export enum MetricType {
    HEART_RATE = 'heartRate',
    STEPS = 'steps',
    SLEEP = 'sleep',
    WATER = 'water',
}

export class AnalyticsQueryDto {
    @IsEnum(TimeGranularity)
    @IsOptional()
    granularity: TimeGranularity = TimeGranularity.DAY;

    @IsDateString()
    @IsOptional()
    startDate?: string;

    @IsDateString()
    @IsOptional()
    endDate?: string;

    @IsNumber()
    @IsOptional()
    @Transform(({ value }) => parseInt(value, 10))
    days?: number;
}

import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, IsDateString } from 'class-validator';

export class UpdateHealthMetricDto {
    @ApiProperty({ description: 'Type of metric to update', example: 'steps' })
    @IsString()
    type: 'steps' | 'heartRate' | 'sleep' | 'water';

    @ApiProperty({ description: 'Value of the metric', example: 5000 })
    @IsNumber()
    value: number;

    @ApiProperty({ description: 'Timestamp of the update (optional)', required: false })
    @IsOptional()
    @IsDateString()
    timestamp?: string;
}

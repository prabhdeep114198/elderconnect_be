import { IsDateString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ComparativeAnalysisDto {
    @ApiProperty({ description: 'Start date for the first period', example: '2023-01-01' })
    @IsDateString()
    @IsNotEmpty()
    period1Start: string;

    @ApiProperty({ description: 'End date for the first period', example: '2023-01-31' })
    @IsDateString()
    @IsNotEmpty()
    period1End: string;

    @ApiProperty({ description: 'Start date for the second period', example: '2023-02-01' })
    @IsDateString()
    @IsNotEmpty()
    period2Start: string;

    @ApiProperty({ description: 'End date for the second period', example: '2023-02-28' })
    @IsDateString()
    @IsNotEmpty()
    period2End: string;
}

import { IsString, IsOptional, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateSocialEventDto {
    @ApiProperty({ example: 'Gardening Club' })
    @IsString()
    @IsNotEmpty()
    title: string;

    @ApiProperty({ example: 'Morning gathering to plant flowers', required: false })
    @IsString()
    @IsOptional()
    description?: string;

    @ApiProperty({ example: 'Community Garden', required: false })
    @IsString()
    @IsOptional()
    location?: string;

    @ApiProperty({ example: '2026-02-03T10:00:00Z', required: false })
    @IsOptional()
    scheduledAt?: string;

    @ApiProperty({ example: '2026-02-03', required: false })
    @IsString()
    @IsOptional()
    date?: string;

    @ApiProperty({ example: '10:00 AM', required: false })
    @IsString()
    @IsOptional()
    time?: string;

    @ApiProperty({ example: 'social', required: false })
    @IsString()
    @IsOptional()
    category?: string;

    @ApiProperty({ example: 'social', required: false })
    @IsString()
    @IsOptional()
    type?: string;
}

export class UpdateSocialEventDto {
    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    title?: string;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    description?: string;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    location?: string;

    @ApiProperty({ required: false })
    @IsOptional()
    scheduledAt?: string;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    category?: string;
}

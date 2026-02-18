import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsJSON, IsOptional, IsString, IsUUID } from 'class-validator';
import { InteractionType } from '../entities/user-interaction.entity';

export class CreateInteractionDto {
    @ApiProperty({ enum: InteractionType })
    @IsEnum(InteractionType)
    type: InteractionType;

    @ApiPropertyOptional()
    @IsString()
    @IsOptional()
    targetId?: string;

    @ApiPropertyOptional()
    @IsJSON()
    @IsOptional()
    metadata?: Record<string, any>;
}

export class PersonalizationResponseDto {
    @ApiProperty()
    recommendations: Recommendation[];

    @ApiProperty()
    dailyBriefing: string;

    @ApiProperty()
    wellnessSummary: any;
}

export class Recommendation {
    @ApiProperty()
    type: 'music' | 'event' | 'activity' | 'medication' | 'social';

    @ApiProperty()
    title: string;

    @ApiProperty()
    description: string;

    @ApiPropertyOptional()
    actionUrl?: string;

    @ApiPropertyOptional()
    reason?: string;

    @ApiPropertyOptional()
    priority: 'low' | 'medium' | 'high';

    @ApiPropertyOptional()
    score?: number;

    @ApiPropertyOptional()
    safetyWarnings?: string[];

    @ApiPropertyOptional()
    metadata?: Record<string, any>;
}

export class UserChatContextDto {
    @ApiProperty()
    userId: string;

    @ApiProperty()
    profileSummary: {
        conditions: string[];
        allergies: string[];
        hobbies: string[];
    };

    @ApiProperty()
    healthStatus: {
        physicalScore: number;
        mentalScore: number;
        riskLevel: string;
        recentAlerts: number;
    };

    @ApiProperty()
    engagementLevel: 'low' | 'medium' | 'high';

    @ApiProperty()
    primaryConcerns: string[];
}

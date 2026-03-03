import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsObject, IsOptional } from 'class-validator';

export class UserContextDto {
    @ApiProperty({ example: 'uuid-user-id' })
    @IsString()
    @IsNotEmpty()
    userId: string;

    @ApiProperty({ example: 'John Doe', required: false })
    @IsOptional()
    @IsString()
    name?: string;

    [key: string]: any;
}

export class VoiceAssistantRequestDto {
    @ApiProperty({ example: 'I want to schedule a doctor appointment tomorrow at 10 AM' })
    @IsString()
    @IsOptional()
    text: string;

    @ApiProperty({ type: UserContextDto })
    @IsOptional()
    userContext: any;

    @ApiProperty({ example: false, required: false })
    @IsOptional()
    isConfirmation?: boolean;

    @ApiProperty({ required: false })
    @IsOptional()
    pendingIntent?: any;

    @ApiProperty({ example: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
    @IsString()
    @IsNotEmpty()
    jwt: string;
}

// ─── Intent Response Types ────────────────────────────────────────────────────

export type IntentType =
    | 'CREATE_EVENT'
    | 'LOG_VITAL'
    | 'REMINDER'
    | 'QUERY_INFO'
    | 'ERROR'
    | 'UNKNOWN';

export interface ParsedIntentData {
    // CREATE_EVENT / REMINDER fields
    title?: string;
    scheduledAt?: string;
    location?: string | null;
    description?: string;
    type?: 'appointment' | 'medication' | 'activity' | 'reminder';

    // LOG_VITAL fields
    vitalType?: string;
    value?: string;
    unit?: string;
    notes?: string;

    // QUERY_INFO fields
    queryType?: string;
    details?: string;

    [key: string]: any;
}

export interface ParsedIntent {
    typeOfRequest: IntentType;
    correctedText: string;
    message: string;
    jwt: string;
    data: ParsedIntentData;
}

export interface VoiceAssistantResponse {
    success: boolean;
    action: string;
    originalText: string;
    correctedText: string;
    message: string;
    timestamp: string;
    eventId?: string;
    vitalId?: string;
    medicationId?: string;
    appointmentId?: string;
    requiresConfirmation?: boolean;
    pendingIntent?: any;
    data?: any;
}

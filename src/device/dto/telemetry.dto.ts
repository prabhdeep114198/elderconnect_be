import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsDateString,
  IsNumber,
  IsBoolean,
  IsObject,
  IsArray,
  Min,
  Max,
  MaxLength,
} from 'class-validator';

export class CreateTelemetryDto {
  @ApiProperty({
    description: 'Type of metric being recorded',
    example: 'heart_rate',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  metricType?: string;

  @ApiProperty({
    description: 'Metric value (flexible structure)',
    example: { bpm: 72, variability: 45 },
    required: false,
  })
  @IsOptional()
  @IsObject()
  value?: Record<string, any>;

  @ApiProperty({
    description: 'Unit of measurement',
    example: 'bpm',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  unit?: string;

  @ApiProperty({
    description: 'Timestamp when the reading was taken',
    example: '2024-01-01T12:00:00Z',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  timestamp?: string;

  @ApiProperty({
    description: 'Latitude coordinate',
    example: 40.7128,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiProperty({
    description: 'Longitude coordinate',
    example: -74.0060,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @ApiProperty({
    description: 'Location description',
    example: 'Home',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  location?: string;

  @ApiProperty({
    description: 'Additional metadata',
    example: { activity: 'resting', environment: 'indoor' },
    required: false,
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;

  @ApiProperty({
    description: 'Data quality indicator',
    example: 'good',
    enum: ['good', 'fair', 'poor'],
    required: false,
  })
  @IsOptional()
  @IsString()
  quality?: string;

  @ApiProperty({
    description: 'Confidence score (0-1)',
    example: 0.95,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  confidenceScore?: number;

  // IoT Flat Payload Support
  @IsOptional()
  @IsNumber()
  heartRate?: number;

  @IsOptional()
  @IsNumber()
  bloodPressureSystolic?: number;

  @IsOptional()
  @IsNumber()
  bloodPressureDiastolic?: number;

  @IsOptional()
  @IsNumber()
  temperature?: number;

  @IsOptional()
  @IsNumber()
  steps?: number;
}

export class BulkTelemetryDto {
  @ApiProperty({
    description: 'Array of telemetry readings',
    type: [CreateTelemetryDto],
  })
  @IsArray()
  readings: CreateTelemetryDto[];

  @ApiProperty({
    description: 'Batch metadata',
    example: { batchId: 'batch_123', deviceFirmware: '1.2.3' },
    required: false,
  })
  @IsOptional()
  @IsObject()
  batchMetadata?: Record<string, any>;
}

export class CreateVitalsDto {
  @ApiProperty({
    description: 'Type of vital sign',
    example: 'blood_pressure',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  vitalType?: string;

  @ApiProperty({
    description: 'Alias for vitalType',
    example: 'blood_pressure',
    required: false,
  })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiProperty({
    description: 'Vital sign reading',
    example: { systolic: 120, diastolic: 80 },
    required: false,
  })
  @IsOptional()
  reading?: any;

  @ApiProperty({
    description: 'Alias for reading',
    example: '120/80',
    required: false,
  })
  @IsOptional()
  value?: any;

  @ApiProperty({
    description: 'Unit of measurement',
    example: 'mmHg',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  unit?: string;

  @ApiProperty({
    description: 'When the reading was recorded',
    example: '2024-01-01T12:00:00Z',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  recordedAt?: string;

  @ApiProperty({
    description: 'How the reading was recorded',
    example: 'device',
    enum: ['device', 'manual', 'caregiver'],
    required: false,
  })
  @IsOptional()
  @IsString()
  recordedBy?: string;

  @ApiProperty({
    description: 'Additional notes',
    example: 'Patient was resting',
    required: false,
  })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({
    description: 'Context of the reading',
    example: 'resting',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  context?: string;

  @ApiProperty({
    description: 'Associated symptoms',
    example: ['headache', 'dizziness'],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  symptoms?: string[];
}

export class CreateSOSDto {
  @ApiProperty({
    description: 'Type of SOS alert',
    example: 'panic_button',
    enum: ['manual', 'fall_detection', 'heart_rate_anomaly', 'medication_missed', 'inactivity', 'geofence_breach', 'panic_button'],
  })
  @IsString()
  type: string;

  @ApiProperty({
    description: 'Alert description',
    example: 'Emergency button pressed by user',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'Alias for description',
    example: 'Emergency button pressed',
    required: false,
  })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({
    description: 'Latitude coordinate',
    example: 40.7128,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiProperty({
    description: 'Longitude coordinate',
    example: -74.0060,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude?: number;

  @ApiProperty({
    description: 'Address or location description',
    example: '123 Main St, New York, NY',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @ApiProperty({
    description: 'Additional context data',
    example: { heartRate: 120, lastActivity: '2024-01-01T11:30:00Z' },
    required: false,
  })
  @IsOptional()
  @IsObject()
  contextData?: Record<string, any>;

  @ApiProperty({
    description: 'Priority level',
    example: 'critical',
    enum: ['low', 'medium', 'high', 'critical'],
    required: false,
  })
  @IsOptional()
  @IsString()
  priority?: string;
}

export class UpdateSOSDto {
  @ApiProperty({
    description: 'New status for the alert',
    example: 'acknowledged',
    enum: ['active', 'acknowledged', 'resolved', 'false_alarm'],
    required: false,
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiProperty({
    description: 'Resolution description',
    example: 'False alarm - user is safe',
    required: false,
  })
  @IsOptional()
  @IsString()
  resolution?: string;

  @ApiProperty({
    description: 'Response actions taken',
    example: [{ action: 'called_emergency_contact', result: 'contacted' }],
    required: false,
  })
  @IsOptional()
  @IsArray()
  responseActions?: Record<string, any>[];
}

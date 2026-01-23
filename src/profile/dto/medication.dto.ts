import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsDateString,
  IsArray,
  IsBoolean,
  IsNumber,
  IsEnum,
  MaxLength,
  Min,
  Max,
} from 'class-validator';
import { MedicationLogStatus } from '../entities/medication-log.entity';

export class CreateMedicationDto {
  @ApiProperty({
    description: 'Medication name',
    example: 'Lisinopril',
  })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiProperty({
    description: 'Generic name of the medication',
    example: 'Lisinopril',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  genericName?: string;

  @ApiProperty({
    description: 'Dosage amount',
    example: '10',
  })
  @IsString()
  @MaxLength(100)
  dosage: string;

  @ApiProperty({
    description: 'Frequency of medication',
    example: 'Once daily',
  })
  @IsString()
  @MaxLength(100)
  frequency: string;

  @ApiProperty({
    description: 'Unit of measurement',
    example: 'mg',
  })
  @IsString()
  @MaxLength(50)
  @IsOptional()
  unit?: string;

  @ApiProperty({
    description: 'Special instructions',
    example: 'Take with food',
    required: false,
  })
  @IsOptional()
  @IsString()
  instructions?: string;

  @ApiProperty({
    description: 'Prescribing doctor',
    example: 'Dr. Smith',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  prescribedBy?: string;

  @ApiProperty({
    description: 'Time of medication',
    example: '08:00',
    required: false,
  })
  @IsOptional()
  @IsString()
  time?: string;

  @ApiProperty({
    description: 'Start date',
    example: '2024-01-01',
  })
  @IsDateString()
  startDate: string;

  @ApiProperty({
    description: 'End date',
    example: '2024-12-31',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiProperty({
    description: 'Medical condition being treated',
    example: 'Hypertension',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  condition?: string;

  @ApiProperty({
    description: 'Known side effects',
    example: ['Dizziness', 'Dry cough'],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sideEffects?: string[];

  @ApiProperty({
    description: 'Drug interactions',
    example: ['Potassium supplements'],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  interactions?: string[];

  @ApiProperty({
    description: 'Medication schedule',
    example: { morning: '08:00', evening: '20:00' },
    required: false,
  })
  @IsOptional()
  schedule?: Record<string, any>;

  @ApiProperty({
    description: 'Enable reminders',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  reminderEnabled?: boolean;

  @ApiProperty({
    description: 'Minutes before scheduled time to remind',
    example: 30,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1440)
  reminderMinutesBefore?: number;

  @ApiProperty({
    description: 'Days before running out to remind for refill',
    example: 7,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(90)
  refillReminder?: number;

  @ApiProperty({
    description: 'Current stock count',
    example: 30,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  currentStock?: number;

  @ApiProperty({
    description: 'Pill color',
    example: 'White',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  color?: string;

  @ApiProperty({
    description: 'Pill shape',
    example: 'Round',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  shape?: string;

  @ApiProperty({
    description: 'Additional notes',
    example: 'Store in cool, dry place',
    required: false,
  })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateMedicationDto extends CreateMedicationDto {
  @ApiProperty({
    description: 'Whether the medication is active',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class LogMedicationDto {
  @ApiProperty({
    description: 'Scheduled time for the medication',
    example: '2024-01-01T08:00:00Z',
  })
  @IsDateString()
  scheduledTime: string;

  @ApiProperty({
    description: 'Actual time medication was taken',
    example: '2024-01-01T08:05:00Z',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  actualTime?: string;

  @ApiProperty({
    description: 'Status of medication',
    enum: MedicationLogStatus,
    example: MedicationLogStatus.TAKEN,
  })
  @IsEnum(MedicationLogStatus)
  status: MedicationLogStatus;

  @ApiProperty({
    description: 'Actual dosage taken',
    example: '10 mg',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  dosageTaken?: string;

  @ApiProperty({
    description: 'Notes about taking the medication',
    example: 'Took with breakfast',
    required: false,
  })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({
    description: 'Location where medication was taken',
    example: 'Home',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  location?: string;

  @ApiProperty({
    description: 'Side effects experienced',
    example: ['Mild dizziness'],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sideEffectsReported?: string[];

  @ApiProperty({
    description: 'Pain level before medication (1-10)',
    example: 7,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  painLevelBefore?: number;

  @ApiProperty({
    description: 'Pain level after medication (1-10)',
    example: 3,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10)
  painLevelAfter?: number;

  @ApiProperty({
    description: 'Mood before medication',
    example: 'Anxious',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  moodBefore?: string;

  @ApiProperty({
    description: 'Mood after medication',
    example: 'Calm',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  moodAfter?: string;
}

import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsDateString, IsInt, IsEnum, MaxLength } from 'class-validator';
import { AppointmentStatus } from '../entities/appointment.entity';

export class CreateAppointmentDto {
    @ApiProperty({ example: 'Cardiology Check-up', required: false })
    @IsOptional()
    @IsString()
    @MaxLength(255)
    title?: string;

    @ApiProperty({ example: 'Annual heart health review', required: false })
    @IsOptional()
    @IsString()
    description?: string;

    @ApiProperty({ example: 'Dr. Sarah Smith', required: false })
    @IsOptional()
    @IsString()
    @MaxLength(255)
    doctorName?: string;

    @ApiProperty({ example: 'Building A, Room 302', required: false })
    @IsOptional()
    @IsString()
    @MaxLength(255)
    location?: string;

    @ApiProperty({ example: 'City Hospital', required: false })
    @IsOptional()
    @IsString()
    @MaxLength(255)
    clinicName?: string;

    @ApiProperty({ example: 'Cardiology', required: false })
    @IsOptional()
    @IsString()
    @MaxLength(255)
    specialty?: string;

    @ApiProperty({ example: '2026-02-15T10:00:00Z', required: false })
    @IsOptional()
    @IsDateString()
    scheduledAt?: string;

    @ApiProperty({ example: '2026-02-15T10:00:00Z', required: false })
    @IsOptional()
    @IsDateString()
    dateTime?: string;

    @ApiProperty({ example: 45, default: 30 })
    @IsOptional()
    @IsInt()
    durationMinutes?: number;

    @ApiProperty({ example: 'Bring latest reports', required: false })
    @IsOptional()
    @IsString()
    notes?: string;

    @ApiProperty({ example: true, default: true })
    @IsOptional()
    reminderEnabled?: boolean;

    @ApiProperty({ example: 60, default: 60 })
    @IsOptional()
    @IsInt()
    reminderMinutesBefore?: number;
}

export class UpdateAppointmentDto extends CreateAppointmentDto {
    @ApiProperty({ enum: AppointmentStatus, required: false })
    @IsOptional()
    @IsEnum(AppointmentStatus)
    status?: AppointmentStatus;
}

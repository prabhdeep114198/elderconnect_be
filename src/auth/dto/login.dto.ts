import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength, IsOptional } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    description: 'User email address',
    example: 'john.doe@example.com',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    description: 'User password',
    example: 'SecurePassword123!',
  })
  @IsString()
  @MinLength(1)
  password: string;

  @ApiProperty({
    description: 'Device information for tracking',
    example: 'Mozilla/5.0...',
    required: false,
  })
  @IsOptional()
  @IsString()
  userAgent?: string;

  @ApiProperty({
    description: 'Remember me option',
    example: false,
    required: false,
  })
  @IsOptional()
  rememberMe?: boolean;
}

export class DeviceRegisterDto {
  @ApiProperty({
    description: 'Unique device identifier',
    example: 'DEVICE_12345_ABCDEF',
  })
  @IsString()
  @MinLength(1)
  deviceId: string;

  @ApiProperty({
    description: 'Device name',
    example: 'Smart Watch Pro',
    required: false,
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({
    description: 'Device type',
    example: 'wearable',
  })
  @IsString()
  @IsOptional()
  type?: string;

  @ApiProperty({
    description: 'Alias for type',
    example: 'wearable',
    required: false,
  })
  @IsOptional()
  @IsString()
  deviceType?: string;

  @ApiProperty({
    description: 'Owner ID (for registration without user context)',
    example: 'uuid',
    required: false,
  })
  @IsOptional()
  @IsString()
  ownerId?: string;

  @ApiProperty({
    description: 'Device manufacturer',
    example: 'TechCorp',
    required: false,
  })
  @IsOptional()
  @IsString()
  manufacturer?: string;

  @ApiProperty({
    description: 'Device model',
    example: 'SW-Pro-2024',
    required: false,
  })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiProperty({
    description: 'Firmware version',
    example: '1.2.3',
    required: false,
  })
  @IsOptional()
  @IsString()
  firmwareVersion?: string;

  @ApiProperty({
    description: 'Device capabilities',
    example: ['heart_rate', 'gps', 'accelerometer'],
    required: false,
  })
  @IsOptional()
  capabilities?: string[];

  @ApiProperty({
    description: 'Device configuration',
    example: { sampleRate: 60, alertThreshold: 100 },
    required: false,
  })
  @IsOptional()
  configuration?: Record<string, any>;

  @ApiProperty({
    description: 'Certificate fingerprint',
    required: false,
  })
  @IsOptional()
  @IsString()
  certificateFingerprint?: string;
}

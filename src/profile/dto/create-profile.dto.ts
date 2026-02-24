import { ApiProperty } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsDateString,
  IsNumber,
  IsArray,
  IsBoolean,
  IsPhoneNumber,
  MaxLength,
  Min,
  Max,
  IsIn,
} from 'class-validator';

export class CreateProfileDto {
  @ApiProperty({
    description: 'Date of birth',
    example: '1950-01-15',
    required: false,
  })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiProperty({
    description: 'Gender',
    example: 'male',
    enum: ['male', 'female', 'other'],
    required: false,
  })
  @IsOptional()
  @IsString()
  @IsIn(['male', 'female', 'other'])
  gender?: string;

  @ApiProperty({
    description: 'Height in centimeters',
    example: 175.5,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(50)
  @Max(300)
  height?: number;

  @ApiProperty({
    description: 'Height in centimeters (alias for height)',
    example: 175.5,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(50)
  @Max(300)
  heightCm?: number;

  @ApiProperty({
    description: 'Weight in kilograms',
    example: 70.5,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(20)
  @Max(500)
  weight?: number;

  @ApiProperty({
    description: 'Weight in kilograms (alias for weight)',
    example: 70.5,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(20)
  @Max(500)
  weightKg?: number;

  @ApiProperty({
    description: 'Blood type',
    example: 'A+',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  bloodType?: string;

  @ApiProperty({
    description: 'List of allergies',
    example: ['Penicillin', 'Peanuts'],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allergies?: string[];

  @ApiProperty({
    description: 'List of medical conditions',
    example: ['Diabetes', 'Hypertension'],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  medicalConditions?: string[];

  @ApiProperty({
    description: 'Primary physician name',
    example: 'Dr. John Smith',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  primaryPhysician?: string;

  @ApiProperty({
    description: 'Primary physician phone number',
    example: '+1234567890',
    required: false,
  })
  @IsOptional()
  @IsPhoneNumber()
  primaryPhysicianPhone?: string;

  @ApiProperty({
    description: 'Emergency contact name',
    example: 'Jane Doe',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  emergencyContactName?: string;

  @ApiProperty({
    description: 'Emergency contact phone number',
    example: '+1234567890',
    required: false,
  })
  @IsOptional()
  @IsPhoneNumber()
  emergencyContactPhone?: string;

  @ApiProperty({
    description: 'Emergency contact relation',
    example: 'Daughter',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  emergencyContactRelation?: string;

  @ApiProperty({
    description: 'Address',
    example: '123 Main St, Apt 4B',
    required: false,
  })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiProperty({
    description: 'City',
    example: 'New York',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiProperty({
    description: 'State',
    example: 'NY',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string;

  @ApiProperty({
    description: 'ZIP code',
    example: '10001',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  zipCode?: string;

  @ApiProperty({
    description: 'Country',
    example: 'United States',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;

  @ApiProperty({
    description: 'Timezone',
    example: 'America/New_York',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  timezone?: string;

  @ApiProperty({
    description: 'Preferred language',
    example: 'en',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  language?: string;

  @ApiProperty({
    description: 'Health goals',
    example: { steps: 8000, weight: 65, bloodPressure: '120/80' },
    required: false,
  })
  @IsOptional()
  healthGoals?: Record<string, any>;

  @ApiProperty({
    description: 'User preferences',
    example: { notifications: true, darkMode: false },
    required: false,
  })
  @IsOptional()
  preferences?: Record<string, any>;

  @ApiProperty({
    description: 'Insurance information',
    example: { provider: 'HealthCorp', policyNumber: 'HC123456' },
    required: false,
  })
  @IsOptional()
  insuranceInfo?: Record<string, any>;

  @ApiProperty({
    description: 'Additional notes',
    example: 'Patient prefers morning appointments',
    required: false,
  })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateProfileDto extends CreateProfileDto {
  @ApiProperty({
    description: 'Whether the profile is active',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({
    description: 'User avatar URL',
    example: 'https://example.com/avatar.jpg',
    required: false,
  })
  @IsOptional()
  @IsString()
  avatar?: string;

  @ApiProperty({
    description: 'Full name',
    example: 'John Doe',
    required: false,
  })
  @IsOptional()
  @IsString()
  name?: string;
}

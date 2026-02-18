import { IsString, IsBoolean, IsDate, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class PrivacySectionDto {
  @IsString()
  id: string;

  @IsString()
  title: string;

  @IsString()
  icon: string;

  @IsString()
  content: string;
}

export class AcceptPolicyDto {
  @IsString()
  userId: string;

  @IsString()
  policyId: string;

  @IsDate()
  @Type(() => Date)
  acceptedAt: Date;

  @IsString()
  @IsOptional()
  ipAddress?: string;

  @IsString()
  @IsOptional()
  userAgent?: string;
}

export class AcceptTermsDto {
  @IsString()
  userId: string;

  @IsString()
  termsId: string;

  @IsDate()
  @Type(() => Date)
  acceptedAt: Date;

  @IsString()
  @IsOptional()
  ipAddress?: string;

  @IsString()
  @IsOptional()
  userAgent?: string;
}

export class CreatePolicyDto {
  @IsString()
  language: string;

  @IsString()
  version: string;

  @IsString()
  content: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PrivacySectionDto)
  @IsOptional()
  sections?: PrivacySectionDto[];

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsDate()
  @Type(() => Date)
  effectiveDate: Date;
}

export class CreateTermsDto {
  @IsString()
  language: string;

  @IsString()
  version: string;

  @IsString()
  content: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PrivacySectionDto)
  @IsOptional()
  sections?: PrivacySectionDto[];

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsDate()
  @Type(() => Date)
  effectiveDate: Date;
}
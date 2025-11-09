import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsArray,
  IsNumber,
  MaxLength,
  Min,
  Max,
} from 'class-validator';
import { MediaCategory } from '../entities/media-file.entity';

export class UploadMediaDto {
  @ApiProperty({
    description: 'Category of the media file',
    enum: MediaCategory,
    example: MediaCategory.PROFILE_PHOTO,
    required: false,
  })
  @IsOptional()
  @IsEnum(MediaCategory)
  category?: MediaCategory;

  @ApiProperty({
    description: 'Description of the media file',
    example: 'Profile photo taken on 2024-01-01',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({
    description: 'Tags for the media file',
    example: ['profile', 'photo', '2024'],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiProperty({
    description: 'Whether the file should be publicly accessible',
    example: false,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @ApiProperty({
    description: 'Expiration time in hours (for temporary files)',
    example: 24,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(8760) // Max 1 year
  expirationHours?: number;
}

export class UpdateMediaDto {
  @ApiProperty({
    description: 'New description for the media file',
    example: 'Updated profile photo',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({
    description: 'Updated tags for the media file',
    example: ['profile', 'updated', '2024'],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiProperty({
    description: 'Whether the file should be publicly accessible',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @ApiProperty({
    description: 'Whether the file is active',
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({
    description: 'Category of the media file',
    enum: MediaCategory,
    required: false,
  })
  @IsOptional()
  @IsEnum(MediaCategory)
  category?: MediaCategory;
}

export class MediaQueryDto {
  @ApiProperty({
    description: 'Filter by media category',
    enum: MediaCategory,
    required: false,
  })
  @IsOptional()
  @IsEnum(MediaCategory)
  category?: MediaCategory;

  @ApiProperty({
    description: 'Filter by media type',
    example: 'image',
    enum: ['image', 'video', 'audio', 'document'],
    required: false,
  })
  @IsOptional()
  @IsString()
  mediaType?: string;

  @ApiProperty({
    description: 'Search by tags (comma-separated)',
    example: 'profile,photo',
    required: false,
  })
  @IsOptional()
  @IsString()
  tags?: string;

  @ApiProperty({
    description: 'Include inactive files',
    example: false,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  includeInactive?: boolean;

  @ApiProperty({
    description: 'Number of results to return',
    example: 20,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiProperty({
    description: 'Number of results to skip',
    example: 0,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  offset?: number;
}

export class PresignedUrlDto {
  @ApiProperty({
    description: 'Original file name',
    example: 'profile-photo.jpg',
  })
  @IsString()
  @MaxLength(255)
  fileName: string;

  @ApiProperty({
    description: 'MIME type of the file',
    example: 'image/jpeg',
  })
  @IsString()
  @MaxLength(100)
  mimeType: string;

  @ApiProperty({
    description: 'File size in bytes',
    example: 1048576,
  })
  @IsNumber()
  @Min(1)
  @Max(100 * 1024 * 1024) // Max 100MB
  fileSize: number;

  @ApiProperty({
    description: 'Category of the media file',
    enum: MediaCategory,
    example: MediaCategory.PROFILE_PHOTO,
    required: false,
  })
  @IsOptional()
  @IsEnum(MediaCategory)
  category?: MediaCategory;

  @ApiProperty({
    description: 'Description of the media file',
    example: 'New profile photo',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class MediaProcessingDto {
  @ApiProperty({
    description: 'Type of processing to perform',
    example: 'thumbnail',
    enum: ['thumbnail', 'resize', 'compress', 'transcode'],
  })
  @IsString()
  processingType: string;

  @ApiProperty({
    description: 'Processing parameters',
    example: { width: 200, height: 200, quality: 80 },
    required: false,
  })
  @IsOptional()
  parameters?: Record<string, any>;
}

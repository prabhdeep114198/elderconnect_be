import { IsString, IsEnum, IsOptional, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CallType } from './videocall.enums';

export class InitiateCallDto {
  @ApiProperty({ description: 'User ID of the person being called' })
  @IsString()
  @IsNotEmpty()
  callee_id: string;

  @ApiPropertyOptional({ enum: CallType, default: CallType.VIDEO })
  @IsEnum(CallType)
  @IsOptional()
  call_type?: CallType;
}

export class InitiateCallResponseDto {
  @ApiProperty()
  call_id: string;

  @ApiProperty({ description: 'Unique room ID for WebRTC session' })
  room_id: string;
}

export class JoinCallDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  call_id: string;
}

export class JoinCallResponseDto {
  @ApiProperty()
  room_id: string;

  @ApiProperty()
  call_type: CallType;
}

export class RespondCallDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  call_id: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  reason?: string;
}

export class CallHistoryQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  limit?: number;
}
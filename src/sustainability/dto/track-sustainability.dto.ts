import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsInt, Min } from 'class-validator';

export class TrackReportDto {
  @ApiProperty({ example: 1, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  count?: number;
}

export class TrackTelemedicineDto {
  @ApiProperty({ example: 1, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  count?: number;
}

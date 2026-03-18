import { IsString, IsNotEmpty, IsOptional, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateMemoryDto {
  @ApiProperty({ description: 'The original question asked by the Nostalgia AI' })
  @IsString()
  @IsNotEmpty()
  prompt: string;

  @ApiProperty({ description: 'The text transcript of the memory' })
  @IsString()
  @IsNotEmpty()
  transcript: string;
  
  @ApiPropertyOptional({ description: 'The themes associated with the memory' })
  @IsOptional()
  @IsArray()
  themes?: string[];
}

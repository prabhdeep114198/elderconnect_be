import { IsOptional, IsInt, Min } from 'class-validator';

export class SeedHealthDataDto {
    @IsOptional()
    @IsInt()
    @Min(1)
    days?: number = 7;
}

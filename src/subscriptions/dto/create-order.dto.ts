import { IsNumber, IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateOrderDto {
    @ApiProperty({ example: 999, description: 'Amount in INR' })
    @IsNumber()
    @IsNotEmpty()
    amount: number;

    @ApiProperty({ example: 'INR', description: 'Currency code' })
    @IsString()
    @IsNotEmpty()
    currency: string;
}

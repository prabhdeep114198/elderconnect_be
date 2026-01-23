import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyPaymentDto {
    @ApiProperty({ description: 'Razorpay Order ID' })
    @IsString()
    @IsNotEmpty()
    razorpay_order_id: string;

    @ApiProperty({ description: 'Razorpay Payment ID' })
    @IsString()
    @IsNotEmpty()
    razorpay_payment_id: string;

    @ApiProperty({ description: 'Razorpay Signature' })
    @IsString()
    @IsNotEmpty()
    razorpay_signature: string;
}

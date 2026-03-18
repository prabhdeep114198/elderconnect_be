import { IsNotEmpty, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { SubscriptionTier } from '../../common/enums/subscription-tier.enum';

export class CreateOrderDto {
    @ApiProperty({ example: 'PREMIUM', description: 'Subscription tier' })
    @IsEnum(SubscriptionTier)
    @IsNotEmpty()
    tier: SubscriptionTier;
}

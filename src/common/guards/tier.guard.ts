import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRE_TIER_KEY } from '../decorators/require-tier.decorator';
import { SubscriptionTier } from '../enums/subscription-tier.enum';

@Injectable()
export class TierGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredTiers = this.reflector.getAllAndOverride<SubscriptionTier[]>(REQUIRE_TIER_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredTiers) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    const tierHierarchy = {
      [SubscriptionTier.CORE]: 1,
      [SubscriptionTier.PREMIUM]: 2,
      [SubscriptionTier.ENTERPRISE]: 3,
    };

    const currentTier = user.subscriptionTier || SubscriptionTier.CORE;
    const userTierLevel = tierHierarchy[currentTier];

    const hasAccess = requiredTiers.some((requiredTier) => userTierLevel >= tierHierarchy[requiredTier]);

    if (!hasAccess) {
      throw new ForbiddenException(`Upgrade Required. This feature requires one of the following tiers: ${requiredTiers.join(', ')}`);
    }

    return true;
  }
}

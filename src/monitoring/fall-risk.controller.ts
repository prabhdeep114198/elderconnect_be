import {
    Controller,
    Get,
    Patch,
    Param,
    Body,
    UseGuards,
    HttpCode,
    HttpStatus,
    ForbiddenException,
    BadRequestException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { FallRiskService } from './fall-risk.service';
import { MobilityCoachingPlan } from './fall-risk.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../common/enums/user-role.enum';

@ApiTags('Fall Risk Monitoring')
@Controller('v1/fall-risk')
@UseGuards(AuthGuard(['jwt', 'firebase']))
@ApiBearerAuth()
export class FallRiskController {
    constructor(private readonly fallRiskService: FallRiskService) { }

    /**
     * Authorization helper: a user may only access their own data,
     * unless they are a CAREGIVER or ADMIN.
     */
    private assertAuthorized(currentUser: any, targetUserId: string): void {
        const isSelf = currentUser.id === targetUserId;
        const isPrivileged = currentUser.roles?.includes(UserRole.CAREGIVER)
            || currentUser.roles?.includes(UserRole.ADMIN);

        if (!isSelf && !isPrivileged) {
            throw new ForbiddenException('You are not authorized to view this user\'s fall risk data');
        }
    }

    @Get('analysis/:userId')
    @ApiOperation({ summary: 'Get AI-powered fall risk analysis with activity cluster data' })
    @ApiResponse({ status: 200, description: 'Analysis with K-Means cluster breakdown and multi-factor gait score' })
    @ApiResponse({ status: 403, description: 'Forbidden — cannot view another user\'s data' })
    async getAnalysis(
        @Param('userId') userId: string,
        @CurrentUser() currentUser: any,
    ) {
        this.assertAuthorized(currentUser, userId);
        return this.fallRiskService.getAnalysis(userId);
    }

    /**
     * AI coaching is expensive (~1s Groq LLM call). Rate-limit to 10 req/min
     * to prevent abuse and runaway AI costs.
     */
    @Get('coaching/:userId')
    @Throttle({ default: { limit: 10, ttl: 60_000 } })
    @ApiOperation({ summary: 'Get AI-generated personalized mobility coaching plan' })
    @ApiResponse({
        status: 200,
        description: 'Groq LLM-generated coaching plan with exercises tailored to the user\'s specific activity cluster profile',
        schema: {
            example: {
                summary: 'Your movement analysis shows 45% sedentary days...',
                riskCategory: 'MODERATE',
                weeklyGoal: 'Shift 10% of your sedentary days to moderate activity',
                exercises: [{
                    id: 'ex_001',
                    name: 'Single-Leg Standing Balance',
                    goal: 'Improve proprioception and ankle stability',
                    duration: '30 seconds each leg',
                    sets: 3,
                    difficulty: 'beginner',
                    tailoredReason: 'Selected because your gait variability index is elevated',
                }],
            },
        },
    })
    @ApiResponse({ status: 403, description: 'Forbidden' })
    @ApiResponse({ status: 429, description: 'Too many requests — AI coaching is rate-limited to 10/min' })
    async getCoachingPlan(
        @Param('userId') userId: string,
        @CurrentUser() currentUser: any,
    ): Promise<MobilityCoachingPlan> {
        this.assertAuthorized(currentUser, userId);
        return this.fallRiskService.getCoachingPlan(userId);
    }

    @Get('alerts/:userId')
    @ApiOperation({ summary: 'Get active fall risk alerts for a user' })
    @ApiResponse({ status: 200, description: 'Alerts retrieved successfully' })
    async getAlerts(
        @Param('userId') userId: string,
        @CurrentUser() currentUser: any,
    ) {
        this.assertAuthorized(currentUser, userId);
        return this.fallRiskService.getAlerts(userId);
    }

    @Get('recommendations/:userId')
    @ApiOperation({ summary: 'Get AI-powered fall prevention recommendations (sourced from coaching plan)' })
    @ApiResponse({ status: 200, description: 'Exercise-based recommendations retrieved from AI coaching plan' })
    async getRecommendations(
        @Param('userId') userId: string,
        @CurrentUser() currentUser: any,
    ) {
        this.assertAuthorized(currentUser, userId);
        return this.fallRiskService.getRecommendations(userId);
    }

    @Patch('settings/:userId')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Update fall risk monitoring threshold settings' })
    @ApiResponse({ status: 200, description: 'Settings updated successfully' })
    @ApiResponse({ status: 400, description: 'Invalid threshold value' })
    async updateSettings(
        @Param('userId') userId: string,
        @Body('alertThreshold') alertThreshold: number,
        @CurrentUser() currentUser: any,
    ) {
        this.assertAuthorized(currentUser, userId);

        if (typeof alertThreshold !== 'number' || alertThreshold < 10 || alertThreshold > 95) {
            throw new BadRequestException('alertThreshold must be a number between 10 and 95');
        }

        await this.fallRiskService.updateThreshold(userId, alertThreshold);
        return { message: 'Settings updated successfully' };
    }
}

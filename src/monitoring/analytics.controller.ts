import {
    Controller,
    Get,
    Query,
    Param,
    UseGuards,
    UseInterceptors,
    HttpStatus,
    HttpCode,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { HealthAnalyticsService, HealthAnalytics } from './analytics.service';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';
import { ComparativeAnalysisDto } from './dto/analytics-comparative.dto';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuditLogInterceptor } from '../common/interceptors/audit-log.interceptor';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { ProfileService } from '../profile/profile.service';

@ApiTags('Analytics')
@Controller('v1/users/:userId/analytics')
@UseGuards(AuthGuard(['jwt', 'firebase']), RolesGuard)
@UseInterceptors(AuditLogInterceptor)
@ApiBearerAuth()
export class AnalyticsController {
    constructor(
        private readonly analyticsService: HealthAnalyticsService,
        private readonly profileService: ProfileService,
    ) { }

    private async getProfileId(userId: string): Promise<string> {
        const profile = await this.profileService.getProfile(userId);
        return profile.id;
    }

    @Get('health')
    @ApiOperation({ summary: 'Get comprehensive health analytics' })
    @ApiResponse({ status: 200, description: 'Analytics retrieved successfully' })
    async getHealthAnalytics(
        @Param('userId') userId: string,
        @Query() query: AnalyticsQueryDto,
        @CurrentUser() currentUser: any,
    ): Promise<any> {
        if (userId !== currentUser.id && !currentUser.roles.includes(UserRole.CAREGIVER) && !currentUser.roles.includes(UserRole.ADMIN)) {
            throw new Error('Unauthorized to view analytics for this user');
        }

        const userProfileId = await this.getProfileId(userId);
        const analytics = await this.analyticsService.getHealthAnalytics(userProfileId, query);

        return {
            message: 'Health analytics retrieved successfully',
            data: analytics,
        };
    }

    @Get('comparison')
    @ApiOperation({ summary: 'Get comparative health analysis between two periods' })
    @ApiResponse({ status: 200, description: 'Comparison retrieved successfully' })
    async getComparativeAnalysis(
        @Param('userId') userId: string,
        @Query() query: ComparativeAnalysisDto,
        @CurrentUser() currentUser: any,
    ) {
        if (userId !== currentUser.id && !currentUser.roles.includes(UserRole.CAREGIVER) && !currentUser.roles.includes(UserRole.ADMIN)) {
            throw new Error('Unauthorized to view analytics for this user');
        }

        const userProfileId = await this.getProfileId(userId);
        const comparison = await this.analyticsService.getComparativeAnalysis(
            userProfileId,
            new Date(query.period1Start),
            new Date(query.period1End),
            new Date(query.period2Start),
            new Date(query.period2End),
        );

        return {
            message: 'Comparative analysis retrieved successfully',
            data: comparison,
        };
    }

    @Get('correlation')
    @ApiOperation({ summary: 'Get correlation analysis between health metrics' })
    @ApiQuery({ name: 'days', required: false, type: Number })
    @ApiResponse({ status: 200, description: 'Correlations retrieved successfully' })
    async getCorrelationAnalysis(
        @Param('userId') userId: string,
        @Query('days') days: number = 90,
        @CurrentUser() currentUser: any,
    ) {
        if (userId !== currentUser.id && !currentUser.roles.includes(UserRole.CAREGIVER) && !currentUser.roles.includes(UserRole.ADMIN)) {
            throw new Error('Unauthorized to view analytics for this user');
        }

        const userProfileId = await this.getProfileId(userId);
        const correlation = await this.analyticsService.getCorrelationAnalysis(userProfileId, days);

        return {
            message: 'Correlation analysis retrieved successfully',
            data: correlation,
        };
    }
}

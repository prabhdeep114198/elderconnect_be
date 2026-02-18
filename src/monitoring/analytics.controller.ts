import {
    Controller,
    ForbiddenException,
    Get,
    Logger,
    NotFoundException,
    Param,
    Query,
    UseGuards,
    UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '../common/enums/user-role.enum';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuditLogInterceptor } from '../common/interceptors/audit-log.interceptor';
import { ProfileService } from '../profile/profile.service';
import { HealthAnalyticsService } from './analytics.service';
import { ComparativeAnalysisDto } from './dto/analytics-comparative.dto';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';

@ApiTags('Analytics')
@Controller('v1/users/:userId/analytics')
@UseGuards(AuthGuard(['jwt', 'firebase']), RolesGuard)
@UseInterceptors(AuditLogInterceptor)
@ApiBearerAuth()
export class AnalyticsController {
    private readonly logger = new Logger(AnalyticsController.name);

    constructor(
        private readonly analyticsService: HealthAnalyticsService,
        private readonly profileService: ProfileService,
    ) { }

    private async getProfileId(userId: string): Promise<string> {
        try {
            const profile = await this.profileService.getProfile(userId);
            return profile.id;
        } catch (error) {
            if (error instanceof NotFoundException) {
                this.logger.log(`Profile not found for user ${userId}, creating a default profile for demo/seeding.`);
                const newProfile = await this.profileService.createProfile(userId, {
                    dateOfBirth: '1955-06-15',
                    gender: 'other',
                    height: 170,
                    weight: 65,
                    medicalConditions: ['Sample Data'],
                });
                return newProfile.id;
            }
            throw error;
        }
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
        const analytics = await this.analyticsService.getHealthAnalytics(userId, userProfileId, query);

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

    @Get('wellness-profile')
    @ApiOperation({ summary: 'Get current wellness scores profile' })
    @ApiResponse({ status: 200, description: 'Wellness profile retrieved successfully' })
    async getWellnessProfile(
        @Param('userId') userId: string,
        @CurrentUser() currentUser: any,
    ): Promise<any> {
        if (userId !== currentUser.id && !currentUser.roles.includes(UserRole.CAREGIVER) && !currentUser.roles.includes(UserRole.ADMIN)) {
            throw new Error('Unauthorized to view wellness profile for this user');
        }

        const userProfileId = await this.getProfileId(userId);
        const wellnessProfile = await this.analyticsService.getWellnessProfile(userId, userProfileId);

        return {
            message: 'Wellness profile retrieved successfully',
            data: wellnessProfile,
        };
    }

    @Get('seed')
    @ApiOperation({ summary: 'Seed sample analytics data for the user (Dev purposes)' })
    @ApiResponse({ status: 200, description: 'Data seeded successfully' })
    async seedAnalyticsData(
        @Param('userId') userId: string,
        @CurrentUser() currentUser: any,
    ) {
        // Only allow users to seed for themselves unless they are admin/caregiver
        if (userId !== currentUser.id && !currentUser.roles.includes(UserRole.ADMIN)) {
            this.logger.warn(`Unauthorized attempt to seed data for userId: ${userId} by currentUser: ${currentUser.id}`);
            throw new ForbiddenException('Unauthorized to seed data for this user');
        }

        const userProfileId = await this.getProfileId(userId);
        const result = await this.analyticsService.seedData(userProfileId);

        return {
            message: 'Sample analytics data seeded successfully',
            data: result,
        };
    }
}

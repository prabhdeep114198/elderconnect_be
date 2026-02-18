import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { HealthAnalyticsService } from './analytics.service';
import { ProfileService } from '../profile/profile.service';

@ApiTags('Debug')
@Controller('v1/debug')
export class DebugController {
    constructor(
        private readonly analyticsService: HealthAnalyticsService,
        private readonly profileService: ProfileService,
    ) { }

    @Get('setup-demo')
    @ApiOperation({ summary: 'Setup a demo user and seed data (NO AUTH REQUIRED)' })
    async setupDemo() {
        let profiles = await this.profileService.getProfileList();
        let profile;

        if (profiles.length === 0) {
            const dummyUserId = '00000000-0000-0000-0000-000000000000';
            try {
                profile = await this.profileService.createProfile(dummyUserId, {
                    firstName: 'Demo',
                    lastName: 'User',
                    dateOfBirth: '1960-01-01',
                } as any);
            } catch (e) {
                profile = await this.profileService.getProfile(dummyUserId);
            }
        } else {
            profile = profiles[0];
        }

        const result = await this.analyticsService.seedData(profile.id);
        return {
            message: 'Demo setup complete',
            userId: profile.userId,
            profileId: profile.id,
            seedResult: result,
            urlToVisit: `http://localhost:3000/v1/users/${profile.userId}/analytics/health`
        };
    }

    @Get('profiles')
    @ApiOperation({ summary: 'List all profiles' })
    async getProfiles() {
        return await this.profileService.getProfileList();
    }
}

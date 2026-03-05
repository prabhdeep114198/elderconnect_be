import {
    Controller,
    Get,
    Patch,
    Param,
    Body,
    UseGuards,
    HttpCode,
    HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { FallRiskService } from './fall-risk.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Fall Risk Monitoring')
@Controller('v1/fall-risk')
@UseGuards(AuthGuard(['jwt', 'firebase']))
@ApiBearerAuth()
export class FallRiskController {
    constructor(private readonly fallRiskService: FallRiskService) { }

    @Get('analysis/:userId')
    @ApiOperation({ summary: 'Get fall risk analysis for a user' })
    @ApiResponse({ status: 200, description: 'Analysis retrieved successfully' })
    async getAnalysis(@Param('userId') userId: string) {
        const analysis = await this.fallRiskService.getAnalysis(userId);
        return analysis;
    }

    @Get('alerts/:userId')
    @ApiOperation({ summary: 'Get active fall risk alerts for a user' })
    @ApiResponse({ status: 200, description: 'Alerts retrieved successfully' })
    async getAlerts(@Param('userId') userId: string) {
        const alerts = await this.fallRiskService.getAlerts(userId);
        return alerts;
    }

    @Get('recommendations/:userId')
    @ApiOperation({ summary: 'Get fall prevention recommendations' })
    @ApiResponse({ status: 200, description: 'Recommendations retrieved successfully' })
    async getRecommendations(@Param('userId') userId: string) {
        const recommendations = await this.fallRiskService.getRecommendations(userId);
        return recommendations;
    }

    @Patch('settings/:userId')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Update fall risk monitoring settings' })
    @ApiResponse({ status: 200, description: 'Settings updated successfully' })
    async updateSettings(
        @Param('userId') userId: string,
        @Body('alertThreshold') alertThreshold: number,
    ) {
        await this.fallRiskService.updateThreshold(userId, alertThreshold);
        return { message: 'Settings updated successfully' };
    }
}

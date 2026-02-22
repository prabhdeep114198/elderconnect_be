import { Controller, Get, Post, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { TrendAnalysisService } from './services/trend-analysis.service';
import { FallRiskService } from './services/fall-risk.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('Health Deterioration')
@Controller('deterioration')
@UseGuards(JwtAuthGuard)
export class DeteriorationController {
  constructor(
    private readonly trendAnalysisService: TrendAnalysisService,
    private readonly fallRiskService: FallRiskService,
  ) { }

  @Get('trends/:userId')
  @ApiOperation({ summary: 'Analyze health trends (mobility, med adherence)' })
  async getTrends(@Param('userId') userId: string) {
    return this.trendAnalysisService.analyzeUserTrends(userId);
  }

  @Get('fall-risk/:userId')
  @ApiOperation({ summary: 'Get fall risk assessment history for dashboard' })
  async getFallRiskHistory(@Param('userId') userId: string) {
    return this.fallRiskService.getRiskHistory(userId);
  }

  @Post('fall-risk/:userId/recalculate')
  @ApiOperation({ summary: 'Manually trigger risk recalculation' })
  async recalculateRisk(@Param('userId') userId: string) {
    return this.fallRiskService.recalculateRisk(userId);
  }
}

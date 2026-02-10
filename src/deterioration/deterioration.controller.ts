import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { TrendAnalysisService } from './services/trend-analysis.service';
import { InjectRepository } from '@nestjs/typeorm';
import { HealthDeteriorationTrend } from './entities/health-deterioration-trend.entity';
import { Repository } from 'typeorm';

@Controller('deterioration')
export class DeteriorationController {
  constructor(
    private trendService: TrendAnalysisService,
    @InjectRepository(HealthDeteriorationTrend, 'profile')
    private trendRepo: Repository<HealthDeteriorationTrend>,
  ) { }

  @Get('trends/:userId')
  async getUserTrends(@Param('userId') userId: string) {
    return await this.trendRepo.find({
      where: { userProfileId: userId },
      order: { assessmentDate: 'DESC' },
      take: 10,
    });
  }

  @Get('analyze/:userId')
  async runAnalysis(@Param('userId') userId: string) {
    return await this.trendService.analyzeUserTrends(userId);
  }
}

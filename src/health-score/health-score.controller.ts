import { Controller, Get, Param } from '@nestjs/common';
import { HealthScoreService } from './services/health-score.service';
import { InjectRepository } from '@nestjs/typeorm';
import { PersonalizedHealthScore } from './entities/health-score.entity';
import { Repository } from 'typeorm';

@Controller('health-score')
export class HealthScoreController {
  constructor(
    private scoreService: HealthScoreService,
    @InjectRepository(PersonalizedHealthScore, 'profile')
    private scoreRepo: Repository<PersonalizedHealthScore>,
  ) { }

  @Get(':userId')
  async getLatestScore(@Param('userId') userId: string) {
    const latest = await this.scoreRepo.findOne({
      where: { userProfileId: userId },
      order: { date: 'DESC' },
    });

    if (!latest) {
      // Compute on the fly if not found
      return await this.scoreService.computeDailyScore(userId);
    }

    return latest;
  }

  @Get('history/:userId')
  async getHistory(@Param('userId') userId: string) {
    return await this.scoreRepo.find({
      where: { userProfileId: userId },
      order: { date: 'DESC' },
      take: 7,
    });
  }
}

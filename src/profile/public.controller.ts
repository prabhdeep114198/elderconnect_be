import { Controller, Get } from '@nestjs/common';
import { ProfileService } from './profile.service';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('Public Utils')
@Controller('v1/public')
export class PublicController {
  constructor(private readonly profileService: ProfileService) {}

  @Get('seed')
  @ApiOperation({ summary: 'Seed demo caregiver and elders' })
  async seed() {
    return this.profileService.seedDemoData();
  }
}

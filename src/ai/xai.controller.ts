import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { XaiService } from './xai.service';

@Controller('ai')
export class XaiController {
  constructor(private readonly xaiService: XaiService) {}

  @Get('health-report/:userId')
  async getHealthReport(@Param('userId') userId: string) {
    return await this.xaiService.generateHealthReport(userId);
  }
}

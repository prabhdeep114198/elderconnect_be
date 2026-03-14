import { Controller, Get, Post, Body } from '@nestjs/common';
import { AppService } from './app.service';

@Controller('v1')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Post('sdg-metrics')
  receiveSdgMetrics(@Body() metricsPayload: any) {
    // Log telemetry metrics related to SDG tracking
    console.log('[SDG Telemetry Received]', metricsPayload);
    // Ideally this would save to a timeseries DB or a specific SQL table
    return { success: true, message: "SDG Metrics logged successfully for sustainability reporting." };
  }
}

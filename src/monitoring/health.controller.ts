import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { HealthService } from './health.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Get application health status' })
  @ApiResponse({ status: 200, description: 'Health check successful' })
  async getHealth() {
    const health = await this.healthService.getHealthStatus();
    const { status: healthStatus, ...rest } = health || {};
    return {
      status: healthStatus ?? 'ok',
      timestamp: new Date().toISOString(),
      ...rest,
    };
  }
  @Get('detailed')
  @ApiOperation({ summary: 'Get detailed health status' })
  @ApiResponse({ status: 200, description: 'Detailed health check successful' })
  async getDetailedHealth() {
    const health = await this.healthService.getDetailedHealthStatus();
    const { status: healthStatus, ...rest } = health || {};
    return {
      status: healthStatus ?? 'ok',
      timestamp: new Date().toISOString(),
      ...rest,
    };
  }

  @Get('metrics')
  @ApiOperation({ summary: 'Get application metrics' })
  @ApiResponse({ status: 200, description: 'Metrics retrieved successfully' })
  async getMetrics() {
    const metrics = await this.healthService.getMetrics();
    return {
      timestamp: new Date().toISOString(),
      ...metrics,
    };
  }
}

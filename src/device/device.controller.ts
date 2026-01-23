import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { DeviceService } from './device.service';
import { CreateTelemetryDto, BulkTelemetryDto, CreateVitalsDto, CreateSOSDto, UpdateSOSDto } from './dto/telemetry.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuditLogInterceptor } from '../common/interceptors/audit-log.interceptor';
import { UserRole } from '../common/enums/user-role.enum';
import { SOSStatus } from './entities/sos-alert.entity';

@ApiTags('Device & Telemetry')
@Controller('v1')
@UseGuards(AuthGuard(['jwt', 'firebase']), RolesGuard)
@UseInterceptors(AuditLogInterceptor)
@ApiBearerAuth()
export class DeviceController {
  constructor(private readonly deviceService: DeviceService) { }

  // Telemetry Endpoints
  @Post('devices/:deviceId/telemetry')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit telemetry data from device' })
  @ApiResponse({ status: 201, description: 'Telemetry data recorded successfully' })
  @ApiResponse({ status: 400, description: 'Invalid telemetry data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async createTelemetry(
    @Param('deviceId') deviceId: string,
    @Body() createTelemetryDto: CreateTelemetryDto,
    @CurrentUser() currentUser,
  ) {
    const telemetry = await this.deviceService.createTelemetry(
      deviceId,
      currentUser.id,
      createTelemetryDto,
    );

    return {
      message: 'Telemetry data recorded successfully',
      data: { telemetry },
    };
  }

  @Post('devices/:deviceId/telemetry/bulk')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit bulk telemetry data from device' })
  @ApiResponse({ status: 201, description: 'Bulk telemetry data recorded successfully' })
  @ApiResponse({ status: 400, description: 'Invalid telemetry data' })
  async createBulkTelemetry(
    @Param('deviceId') deviceId: string,
    @Body() bulkTelemetryDto: BulkTelemetryDto,
    @CurrentUser() currentUser,
  ) {
    const telemetry = await this.deviceService.createBulkTelemetry(
      deviceId,
      currentUser.id,
      bulkTelemetryDto,
    );

    return {
      message: 'Bulk telemetry data recorded successfully',
      data: { telemetry, count: telemetry.length },
    };
  }

  @Get('users/:userId/telemetry')
  @ApiOperation({ summary: 'Get user telemetry data' })
  @ApiQuery({ name: 'deviceId', required: false, type: String })
  @ApiQuery({ name: 'metricType', required: false, type: String })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Telemetry data retrieved successfully' })
  async getTelemetry(
    @Param('userId') userId: string,
    @Query('deviceId') deviceId?: string,
    @Query('metricType') metricType?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit: number = 100,
    @CurrentUser() currentUser?: any,
  ) {
    // Authorization check
    if (userId !== currentUser.id && !currentUser.roles.includes(UserRole.CAREGIVER) && !currentUser.roles.includes(UserRole.ADMIN)) {
      throw new Error('Unauthorized to view telemetry for this user');
    }

    const telemetry = await this.deviceService.getTelemetry(
      userId,
      deviceId,
      metricType,
      startDate,
      endDate,
      limit,
    );

    return {
      message: 'Telemetry data retrieved successfully',
      data: { telemetry, count: telemetry.length },
    };
  }

  @Get('users/:userId/telemetry/latest/:metricType')
  @ApiOperation({ summary: 'Get latest telemetry reading for specific metric' })
  @ApiResponse({ status: 200, description: 'Latest telemetry retrieved successfully' })
  @ApiResponse({ status: 404, description: 'No telemetry data found' })
  async getLatestTelemetry(
    @Param('userId') userId: string,
    @Param('metricType') metricType: string,
    @CurrentUser() currentUser,
  ) {
    if (userId !== currentUser.id && !currentUser.roles.includes(UserRole.CAREGIVER) && !currentUser.roles.includes(UserRole.ADMIN)) {
      throw new Error('Unauthorized to view telemetry for this user');
    }

    const telemetry = await this.deviceService.getLatestTelemetry(userId, metricType);

    return {
      message: 'Latest telemetry retrieved successfully',
      data: { telemetry },
    };
  }

  // Vitals Endpoints
  @Post('users/:userId/vitals')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Record vital signs for user' })
  @ApiResponse({ status: 201, description: 'Vitals recorded successfully' })
  @ApiResponse({ status: 400, description: 'Invalid vitals data' })
  async createVitals(
    @Param('userId') userId: string,
    @Body() createVitalsDto: CreateVitalsDto,
    @CurrentUser() currentUser,
  ) {
    if (userId !== currentUser.id && !currentUser.roles.includes(UserRole.CAREGIVER) && !currentUser.roles.includes(UserRole.ADMIN)) {
      throw new Error('Unauthorized to record vitals for this user');
    }

    const vitals = await this.deviceService.createVitals(userId, createVitalsDto);

    return {
      message: 'Vitals recorded successfully',
      data: { vitals },
    };
  }

  @Get('users/:userId/vitals')
  @ApiOperation({ summary: 'Get user vital signs' })
  @ApiQuery({ name: 'vitalType', required: false, type: String })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Vitals retrieved successfully' })
  async getVitals(
    @Param('userId') userId: string,
    @Query('vitalType') vitalType?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('limit') limit: number = 100,
    @CurrentUser() currentUser?: any,
  ) {
    if (userId !== currentUser.id && !currentUser.roles.includes(UserRole.CAREGIVER) && !currentUser.roles.includes(UserRole.ADMIN)) {
      throw new Error('Unauthorized to view vitals for this user');
    }

    const vitals = await this.deviceService.getVitals(
      userId,
      vitalType,
      startDate,
      endDate,
      limit,
    );

    return {
      message: 'Vitals retrieved successfully',
      data: { vitals, count: vitals.length },
    };
  }

  @Get('users/:userId/vitals/latest/:vitalType')
  @ApiOperation({ summary: 'Get latest vital sign reading' })
  @ApiResponse({ status: 200, description: 'Latest vitals retrieved successfully' })
  async getLatestVitals(
    @Param('userId') userId: string,
    @Param('vitalType') vitalType: string,
    @CurrentUser() currentUser,
  ) {
    if (userId !== currentUser.id && !currentUser.roles.includes(UserRole.CAREGIVER) && !currentUser.roles.includes(UserRole.ADMIN)) {
      throw new Error('Unauthorized to view vitals for this user');
    }

    const vitals = await this.deviceService.getLatestVitals(userId, vitalType);

    return {
      message: 'Latest vitals retrieved successfully',
      data: { vitals },
    };
  }

  @Get('users/:userId/vitals/:vitalType/trends')
  @ApiOperation({ summary: 'Get vital signs trends and analytics' })
  @ApiQuery({ name: 'days', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Vitals trends retrieved successfully' })
  async getVitalsTrends(
    @Param('userId') userId: string,
    @Param('vitalType') vitalType: string,
    @Query('days') days: number = 30,
    @CurrentUser() currentUser?: any,
  ) {
    if (userId !== currentUser.id && !currentUser.roles.includes(UserRole.CAREGIVER) && !currentUser.roles.includes(UserRole.ADMIN)) {
      throw new Error('Unauthorized to view vitals trends for this user');
    }

    const trends = await this.deviceService.getVitalsTrends(userId, vitalType, days);

    return {
      message: 'Vitals trends retrieved successfully',
      data: trends,
    };
  }

  // SOS Alert Endpoints
  @Post('devices/:deviceId/sos')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create SOS alert from device' })
  @ApiResponse({ status: 201, description: 'SOS alert created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid SOS data' })
  async createDeviceSOSAlert(
    @Param('deviceId') deviceId: string,
    @Body() createSOSDto: CreateSOSDto,
    @CurrentUser() currentUser,
  ) {
    const alert = await this.deviceService.createDeviceSOSAlert(
      deviceId,
      currentUser.id,
      createSOSDto,
    );

    return {
      message: 'SOS alert created successfully',
      data: { alert },
    };
  }

  @Post('users/:userId/sos')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create SOS alert for user' })
  @ApiResponse({ status: 201, description: 'SOS alert created successfully' })
  async createSOSAlert(
    @Param('userId') userId: string,
    @Body() createSOSDto: CreateSOSDto,
    @CurrentUser() currentUser,
  ) {
    if (userId !== currentUser.id && !currentUser.roles.includes(UserRole.CAREGIVER) && !currentUser.roles.includes(UserRole.ADMIN)) {
      throw new Error('Unauthorized to create SOS alert for this user');
    }

    const alert = await this.deviceService.createSOSAlert(userId, createSOSDto);

    return {
      message: 'SOS alert created successfully',
      data: { alert },
    };
  }

  @Get('users/:userId/sos')
  @ApiOperation({ summary: 'Get SOS alerts for user' })
  @ApiQuery({ name: 'status', required: false, enum: SOSStatus })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'SOS alerts retrieved successfully' })
  async getSOSAlerts(
    @Param('userId') userId: string,
    @Query('status') status?: SOSStatus,
    @Query('limit') limit: number = 50,
    @CurrentUser() currentUser?: any,
  ) {
    if (userId !== currentUser.id && !currentUser.roles.includes(UserRole.CAREGIVER) && !currentUser.roles.includes(UserRole.ADMIN)) {
      throw new Error('Unauthorized to view SOS alerts for this user');
    }

    const alerts = await this.deviceService.getSOSAlerts(userId, status, limit);

    return {
      message: 'SOS alerts retrieved successfully',
      data: { alerts, count: alerts.length },
    };
  }

  @Get('users/:userId/sos/:alertId')
  @ApiOperation({ summary: 'Get specific SOS alert' })
  @ApiResponse({ status: 200, description: 'SOS alert retrieved successfully' })
  @ApiResponse({ status: 404, description: 'SOS alert not found' })
  async getSOSAlert(
    @Param('userId') userId: string,
    @Param('alertId') alertId: string,
    @CurrentUser() currentUser,
  ) {
    if (userId !== currentUser.id && !currentUser.roles.includes(UserRole.CAREGIVER) && !currentUser.roles.includes(UserRole.ADMIN)) {
      throw new Error('Unauthorized to view SOS alert for this user');
    }

    const alert = await this.deviceService.getSOSAlert(userId, alertId);

    return {
      message: 'SOS alert retrieved successfully',
      data: { alert },
    };
  }

  @Put('users/:userId/sos/:alertId')
  @ApiOperation({ summary: 'Update SOS alert status' })
  @ApiResponse({ status: 200, description: 'SOS alert updated successfully' })
  @ApiResponse({ status: 404, description: 'SOS alert not found' })
  async updateSOSAlert(
    @Param('userId') userId: string,
    @Param('alertId') alertId: string,
    @Body() updateSOSDto: UpdateSOSDto,
    @CurrentUser() currentUser,
  ) {
    if (userId !== currentUser.id && !currentUser.roles.includes(UserRole.CAREGIVER) && !currentUser.roles.includes(UserRole.ADMIN)) {
      throw new Error('Unauthorized to update SOS alert for this user');
    }

    const alert = await this.deviceService.updateSOSAlert(
      userId,
      alertId,
      updateSOSDto,
      currentUser.id,
    );

    return {
      message: 'SOS alert updated successfully',
      data: { alert },
    };
  }

  // Admin/Caregiver Endpoints
  @Get('alerts/active')
  @Roles(UserRole.CAREGIVER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get all active SOS alerts' })
  @ApiResponse({ status: 200, description: 'Active alerts retrieved successfully' })
  async getActiveAlerts(@CurrentUser() currentUser) {
    const alerts = await this.deviceService.getActiveAlerts();

    return {
      message: 'Active alerts retrieved successfully',
      data: { alerts, count: alerts.length },
    };
  }

  @Get('alerts/critical')
  @Roles(UserRole.CAREGIVER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get all critical SOS alerts' })
  @ApiResponse({ status: 200, description: 'Critical alerts retrieved successfully' })
  async getCriticalAlerts(@CurrentUser() currentUser) {
    const alerts = await this.deviceService.getCriticalAlerts();

    return {
      message: 'Critical alerts retrieved successfully',
      data: { alerts, count: alerts.length },
    };
  }

  // Device Analytics
  @Get('devices/:deviceId/health')
  @ApiOperation({ summary: 'Get device health summary' })
  @ApiResponse({ status: 200, description: 'Device health summary retrieved successfully' })
  async getDeviceHealthSummary(
    @Param('deviceId') deviceId: string,
    @CurrentUser() currentUser,
  ) {
    const summary = await this.deviceService.getDeviceHealthSummary(currentUser.id, deviceId);

    return {
      message: 'Device health summary retrieved successfully',
      data: summary,
    };
  }
}

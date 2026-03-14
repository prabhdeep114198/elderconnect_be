import {
  Controller,
  Post,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader } from '@nestjs/swagger';
import { DeviceService } from './device.service';
import { CreateSOSDto } from './dto/telemetry.dto';
import { ApiKeyGuard } from '../common/guards/api-key.guard';

@ApiTags('Public Device & Hardware Data (API Key Protected)')
@Controller('v1/public/devices')
@UseGuards(ApiKeyGuard)
export class PublicDeviceController {
  constructor(private readonly deviceService: DeviceService) {}

  @Post(':deviceId/users/:userId/sos')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit an SOS alert from a hardware device without JWT token' })
  @ApiHeader({
    name: 'x-api-key',
    description: 'Hardware API key for authorization',
  })
  @ApiResponse({ status: 201, description: 'SOS alert successfully recorded' })
  @ApiResponse({ status: 401, description: 'Invalid API Key' })
  async createHardwareSOSAlert(
    @Param('deviceId') deviceId: string,
    @Param('userId') userId: string,
    @Body() createSOSDto: CreateSOSDto,
  ) {
    const alert = await this.deviceService.createDeviceSOSAlert(
      deviceId,
      userId,
      createSOSDto,
    );

    return {
      message: 'Hardware SOS alert created successfully via API Key',
      data: { alert },
    };
  }
}

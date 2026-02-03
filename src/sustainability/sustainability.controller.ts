import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { SustainabilityService } from './sustainability.service';
import { TrackReportDto, TrackTelemedicineDto } from './dto/track-sustainability.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../common/enums/user-role.enum';

@ApiTags('Sustainability')
@Controller('v1')
export class SustainabilityController {
  constructor(private readonly sustainabilityService: SustainabilityService) {}

  @Post('users/:userId/sustainability/track-report')
  @UseGuards(AuthGuard(['jwt', 'firebase']), RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Track digital report generated (paper saved)' })
  @ApiResponse({ status: 201, description: 'Report tracked successfully' })
  async trackReport(
    @Param('userId') userId: string,
    @Body() dto: TrackReportDto,
    @CurrentUser() currentUser: any,
  ) {
    if (userId !== currentUser.id && !currentUser.roles?.includes(UserRole.ADMIN)) {
      throw new Error('Unauthorized');
    }
    const metrics = await this.sustainabilityService.trackReport(
      userId,
      dto?.count ?? 1,
    );
    return {
      message: 'Report tracked successfully',
      data: { metrics },
    };
  }

  @Post('users/:userId/sustainability/track-telemedicine')
  @UseGuards(AuthGuard(['jwt', 'firebase']), RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Track telemedicine session (trip avoided)' })
  @ApiResponse({ status: 201, description: 'Telemedicine session tracked successfully' })
  async trackTelemedicine(
    @Param('userId') userId: string,
    @Body() dto: TrackTelemedicineDto,
    @CurrentUser() currentUser: any,
  ) {
    if (userId !== currentUser.id && !currentUser.roles?.includes(UserRole.ADMIN)) {
      throw new Error('Unauthorized');
    }
    const metrics = await this.sustainabilityService.trackTelemedicine(
      userId,
      dto?.count ?? 1,
    );
    return {
      message: 'Telemedicine session tracked successfully',
      data: { metrics },
    };
  }

  @Get('users/:userId/sustainability/impact')
  @UseGuards(AuthGuard(['jwt', 'firebase']), RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get user sustainability impact' })
  @ApiResponse({ status: 200, description: 'User impact retrieved successfully' })
  async getUserImpact(
    @Param('userId') userId: string,
    @CurrentUser() currentUser: any,
    @Query('year') year?: string,
  ) {
    if (userId !== currentUser.id && !currentUser.roles?.includes(UserRole.CAREGIVER) && !currentUser.roles?.includes(UserRole.ADMIN)) {
      throw new Error('Unauthorized');
    }
    const impact = await this.sustainabilityService.getUserImpact(
      userId,
      year ? parseInt(year, 10) : undefined,
    );
    return {
      message: 'Impact retrieved successfully',
      data: impact,
    };
  }

  @Get('sustainability/public')
  @ApiOperation({ summary: 'Get public sustainability impact (no auth)' })
  @ApiResponse({ status: 200, description: 'Public impact retrieved successfully' })
  async getPublicImpact(@Query('year') year?: string) {
    const impact = await this.sustainabilityService.getPublicImpact(
      year ? parseInt(year, 10) : undefined,
    );
    return {
      message: 'Public impact retrieved successfully',
      data: impact,
    };
  }
}

import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
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
import { ProfileService } from './profile.service';
import { CreateProfileDto, UpdateProfileDto } from './dto/create-profile.dto';
import { CreateMedicationDto, UpdateMedicationDto, LogMedicationDto } from './dto/medication.dto';
import { CreateAppointmentDto, UpdateAppointmentDto } from './dto/appointment.dto';
import { UpdateHealthMetricDto } from './dto/update-health-metric.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuditLogInterceptor } from '../common/interceptors/audit-log.interceptor';
import { UserRole } from '../common/enums/user-role.enum';

@ApiTags('User Profile')
@Controller('v1/users/:userId')
@UseGuards(AuthGuard(['jwt', 'firebase']), RolesGuard)
@UseInterceptors(AuditLogInterceptor)
@ApiBearerAuth()
export class ProfileController {
  constructor(private readonly profileService: ProfileService) { }

  // Profile Management
  @Post('profile')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create user profile' })
  @ApiResponse({ status: 201, description: 'Profile created successfully' })
  @ApiResponse({ status: 409, description: 'Profile already exists' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async createProfile(
    @Param('userId') userId: string,
    @Body() createProfileDto: CreateProfileDto,
    @CurrentUser() currentUser,
  ) {
    // Users can only create their own profile, or caregivers/admins can create for others
    if (userId !== currentUser.id && !currentUser.roles.includes(UserRole.CAREGIVER) && !currentUser.roles.includes(UserRole.ADMIN)) {
      throw new Error('Unauthorized to create profile for this user');
    }

    const profile = await this.profileService.createProfile(userId, createProfileDto);

    return {
      message: 'Profile created successfully',
      data: { profile },
    };
  }

  @Get('profile')
  @ApiOperation({ summary: 'Get user profile' })
  @ApiResponse({ status: 200, description: 'Profile retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  async getProfile(
    @Param('userId') userId: string,
    @CurrentUser() currentUser,
  ) {
    // Users can only view their own profile, or caregivers/admins can view others
    if (userId !== currentUser.id && !currentUser.roles.includes(UserRole.CAREGIVER) && !currentUser.roles.includes(UserRole.ADMIN)) {
      throw new Error('Unauthorized to view profile for this user');
    }

    const profile = await this.profileService.getProfile(userId);

    return {
      message: 'Profile retrieved successfully',
      data: { profile },
    };
  }

  @Put('profile')
  @ApiOperation({ summary: 'Update user profile' })
  @ApiResponse({ status: 200, description: 'Profile updated successfully' })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  async updateProfile(
    @Param('userId') userId: string,
    @Body() updateProfileDto: UpdateProfileDto,
    @CurrentUser() currentUser,
  ) {
    if (userId !== currentUser.id && !currentUser.roles.includes(UserRole.CAREGIVER) && !currentUser.roles.includes(UserRole.ADMIN)) {
      throw new Error('Unauthorized to update profile for this user');
    }

    const profile = await this.profileService.updateProfile(userId, updateProfileDto);

    return {
      message: 'Profile updated successfully',
      data: { profile },
    };
  }

  @Delete('profile')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Delete user profile' })
  @ApiResponse({ status: 204, description: 'Profile deleted successfully' })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  async deleteProfile(@Param('userId') userId: string) {
    await this.profileService.deleteProfile(userId);

    return {
      message: 'Profile deleted successfully',
    };
  }

  // Medication Management
  @Post('medications')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add medication to user profile' })
  @ApiResponse({ status: 201, description: 'Medication added successfully' })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  async createMedication(
    @Param('userId') userId: string,
    @Body() createMedicationDto: CreateMedicationDto,
    @CurrentUser() currentUser,
  ) {
    if (userId !== currentUser.id && !currentUser.roles.includes(UserRole.CAREGIVER) && !currentUser.roles.includes(UserRole.ADMIN)) {
      throw new Error('Unauthorized to add medication for this user');
    }

    const medication = await this.profileService.createMedication(userId, createMedicationDto);

    return {
      message: 'Medication added successfully',
      data: { medication },
    };
  }

  @Get('medications')
  @ApiOperation({ summary: 'Get user medications' })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: 'Medications retrieved successfully' })
  async getMedications(
    @Param('userId') userId: string,
    @Query('includeInactive') includeInactive: boolean = false,
    @CurrentUser() currentUser,
  ) {
    if (userId !== currentUser.id && !currentUser.roles.includes(UserRole.CAREGIVER) && !currentUser.roles.includes(UserRole.ADMIN)) {
      throw new Error('Unauthorized to view medications for this user');
    }

    const medications = await this.profileService.getMedications(userId, includeInactive);

    return {
      message: 'Medications retrieved successfully',
      data: { medications },
    };
  }

  @Get('medications/:medicationId')
  @ApiOperation({ summary: 'Get specific medication' })
  @ApiResponse({ status: 200, description: 'Medication retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Medication not found' })
  async getMedication(
    @Param('userId') userId: string,
    @Param('medicationId') medicationId: string,
    @CurrentUser() currentUser,
  ) {
    if (userId !== currentUser.id && !currentUser.roles.includes(UserRole.CAREGIVER) && !currentUser.roles.includes(UserRole.ADMIN)) {
      throw new Error('Unauthorized to view medication for this user');
    }

    const medication = await this.profileService.getMedication(userId, medicationId);

    return {
      message: 'Medication retrieved successfully',
      data: { medication },
    };
  }

  @Put('medications/:medicationId')
  @ApiOperation({ summary: 'Update medication' })
  @ApiResponse({ status: 200, description: 'Medication updated successfully' })
  @ApiResponse({ status: 404, description: 'Medication not found' })
  async updateMedication(
    @Param('userId') userId: string,
    @Param('medicationId') medicationId: string,
    @Body() updateMedicationDto: UpdateMedicationDto,
    @CurrentUser() currentUser,
  ) {
    if (userId !== currentUser.id && !currentUser.roles.includes(UserRole.CAREGIVER) && !currentUser.roles.includes(UserRole.ADMIN)) {
      throw new Error('Unauthorized to update medication for this user');
    }

    const medication = await this.profileService.updateMedication(userId, medicationId, updateMedicationDto);

    return {
      message: 'Medication updated successfully',
      data: { medication },
    };
  }

  @Delete('medications/:medicationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete medication' })
  @ApiResponse({ status: 204, description: 'Medication deleted successfully' })
  @ApiResponse({ status: 404, description: 'Medication not found' })
  async deleteMedication(
    @Param('userId') userId: string,
    @Param('medicationId') medicationId: string,
    @CurrentUser() currentUser,
  ) {
    if (userId !== currentUser.id && !currentUser.roles.includes(UserRole.CAREGIVER) && !currentUser.roles.includes(UserRole.ADMIN)) {
      throw new Error('Unauthorized to delete medication for this user');
    }

    await this.profileService.deleteMedication(userId, medicationId);

    return {
      message: 'Medication deleted successfully',
    };
  }

  // Medication Logging
  @Post('medications/:medicationId/logs')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Log medication intake' })
  @ApiResponse({ status: 201, description: 'Medication logged successfully' })
  @ApiResponse({ status: 409, description: 'Log already exists for this time' })
  async logMedication(
    @Param('userId') userId: string,
    @Param('medicationId') medicationId: string,
    @Body() logMedicationDto: LogMedicationDto,
    @CurrentUser() currentUser,
  ) {
    if (userId !== currentUser.id && !currentUser.roles.includes(UserRole.CAREGIVER) && !currentUser.roles.includes(UserRole.ADMIN)) {
      throw new Error('Unauthorized to log medication for this user');
    }

    const log = await this.profileService.logMedication(userId, medicationId, logMedicationDto);

    return {
      message: 'Medication logged successfully',
      data: { log },
    };
  }

  @Get('medications/:medicationId/logs')
  @ApiOperation({ summary: 'Get medication logs' })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Medication logs retrieved successfully' })
  async getMedicationLogs(
    @Param('userId') userId: string,
    @Param('medicationId') medicationId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @CurrentUser() currentUser?: any,
  ) {
    if (userId !== currentUser.id && !currentUser.roles.includes(UserRole.CAREGIVER) && !currentUser.roles.includes(UserRole.ADMIN)) {
      throw new Error('Unauthorized to view medication logs for this user');
    }

    const logs = await this.profileService.getMedicationLogs(userId, medicationId, startDate, endDate);

    return {
      message: 'Medication logs retrieved successfully',
      data: { logs },
    };
  }

  // Analytics and Reports
  @Get(['health-summary', 'reports/health-summary'])
  @ApiOperation({ summary: 'Get user health summary' })
  @ApiResponse({ status: 200, description: 'Health summary retrieved successfully' })
  async getHealthSummary(
    @Param('userId') userId: string,
    @CurrentUser() currentUser,
  ) {
    if (userId !== currentUser.id && !currentUser.roles.includes(UserRole.CAREGIVER) && !currentUser.roles.includes(UserRole.ADMIN)) {
      throw new Error('Unauthorized to view health summary for this user');
    }

    const summary = await this.profileService.getHealthSummary(userId);

    return {
      message: 'Health summary retrieved successfully',
      data: summary,
    };
  }

  @Get(['medication-compliance', 'reports/medication-compliance'])
  @ApiOperation({ summary: 'Get medication compliance report' })
  @ApiQuery({ name: 'days', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Compliance report retrieved successfully' })
  async getMedicationCompliance(
    @Param('userId') userId: string,
    @Query('days') days: number = 30,
    @CurrentUser() currentUser,
  ) {
    if (userId !== currentUser.id && !currentUser.roles.includes(UserRole.CAREGIVER) && !currentUser.roles.includes(UserRole.ADMIN)) {
      throw new Error('Unauthorized to view compliance report for this user');
    }

    const compliance = await this.profileService.getMedicationCompliance(userId, days);

    return {
      message: 'Compliance report retrieved successfully',
      data: compliance,
    };
  }

  @Get('medication-reminders')
  @ApiOperation({ summary: 'Get upcoming medication reminders' })
  @ApiResponse({ status: 200, description: 'Reminders retrieved successfully' })
  async getMedicationReminders(
    @Param('userId') userId: string,
    @CurrentUser() currentUser,
  ) {
    if (userId !== currentUser.id && !currentUser.roles.includes(UserRole.CAREGIVER) && !currentUser.roles.includes(UserRole.ADMIN)) {
      throw new Error('Unauthorized to view reminders for this user');
    }

    const reminders = await this.profileService.getMedicationReminders(userId);

    return {
      message: 'Reminders retrieved successfully',
      data: { reminders },
    };
  }

  // Health Metrics Endpoints
  @Post('health/metrics')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update daily health metric' })
  @ApiResponse({ status: 200, description: 'Metric updated successfully' })
  async updateHealthMetric(
    @Param('userId') userId: string,
    @Body() updateDto: UpdateHealthMetricDto,
    @CurrentUser() currentUser,
  ) {
    if (userId !== currentUser.id && !currentUser.roles.includes(UserRole.CAREGIVER) && !currentUser.roles.includes(UserRole.ADMIN)) {
      throw new Error('Unauthorized to update health metrics for this user');
    }

    const metric = await this.profileService.updateHealthMetric(userId, updateDto);

    return {
      message: 'Health metric updated successfully',
      data: metric,
    };
  }

  @Get('health/metrics')
  @ApiOperation({ summary: 'Get daily health metrics' })
  @ApiQuery({ name: 'date', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Metrics retrieved successfully' })
  async getDailyMetrics(
    @Param('userId') userId: string,
    @Query('date') dateString: string,
    @CurrentUser() currentUser,
  ) {
    if (userId !== currentUser.id && !currentUser.roles.includes(UserRole.CAREGIVER) && !currentUser.roles.includes(UserRole.ADMIN)) {
      throw new Error('Unauthorized to view health metrics for this user');
    }

    const date = dateString ? new Date(dateString) : new Date();
    const metrics = await this.profileService.getDailyMetrics(userId, date);

    // Format for frontend
    return {
      message: 'Metrics retrieved successfully',
      data: {
        metrics: [
          { label: "Steps Today", value: metrics.steps.toLocaleString(), icon: "walk", trend: metrics.steps > 5000 ? "up" : "down" },
          { label: "Heart Rate", value: `${metrics.heartRate || 72} bpm`, icon: "heart", trend: "stable" },
          { label: "Sleep Quality", value: `${metrics.sleepHours || 0} hrs`, icon: "moon", trend: (metrics.sleepHours || 0) >= 7 ? "up" : "down" },
          { label: "Hydration", value: `${metrics.waterIntake || 0}/8 cups`, icon: "water", trend: (metrics.waterIntake || 0) >= 6 ? "up" : "down" },
        ],
        raw: metrics // Send raw data too just in case
      }
    };
  }

  // Appointment Management
  @Post('appointments')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new appointment' })
  async createAppointment(
    @Param('userId') userId: string,
    @Body() createDto: CreateAppointmentDto,
    @CurrentUser() currentUser,
  ) {
    if (userId !== currentUser.id && !currentUser.roles.includes(UserRole.CAREGIVER) && !currentUser.roles.includes(UserRole.ADMIN)) {
      throw new Error('Unauthorized to create appointment for this user');
    }

    const appointment = await this.profileService.createAppointment(userId, createDto);

    return {
      message: 'Appointment created successfully',
      data: { appointment },
    };
  }

  @Get('appointments')
  @ApiOperation({ summary: 'Get user appointments' })
  async getAppointments(
    @Param('userId') userId: string,
    @CurrentUser() currentUser,
  ) {
    if (userId !== currentUser.id && !currentUser.roles.includes(UserRole.CAREGIVER) && !currentUser.roles.includes(UserRole.ADMIN)) {
      throw new Error('Unauthorized to view appointments for this user');
    }

    const appointments = await this.profileService.getAppointments(userId);

    return {
      message: 'Appointments retrieved successfully',
      data: { appointments },
    };
  }

  @Get('appointments/:appointmentId')
  @ApiOperation({ summary: 'Get specific appointment' })
  async getAppointment(
    @Param('userId') userId: string,
    @Param('appointmentId') appointmentId: string,
    @CurrentUser() currentUser,
  ) {
    if (userId !== currentUser.id && !currentUser.roles.includes(UserRole.CAREGIVER) && !currentUser.roles.includes(UserRole.ADMIN)) {
      throw new Error('Unauthorized to view appointment for this user');
    }

    const appointment = await this.profileService.getAppointment(userId, appointmentId);

    return {
      message: 'Appointment retrieved successfully',
      data: { appointment },
    };
  }

  @Put('appointments/:appointmentId')
  @ApiOperation({ summary: 'Update appointment' })
  async updateAppointment(
    @Param('userId') userId: string,
    @Param('appointmentId') appointmentId: string,
    @Body() updateDto: UpdateAppointmentDto,
    @CurrentUser() currentUser,
  ) {
    if (userId !== currentUser.id && !currentUser.roles.includes(UserRole.CAREGIVER) && !currentUser.roles.includes(UserRole.ADMIN)) {
      throw new Error('Unauthorized to update appointment for this user');
    }

    const appointment = await this.profileService.updateAppointment(userId, appointmentId, updateDto);

    return {
      message: 'Appointment updated successfully',
      data: { appointment },
    };
  }

  @Delete('appointments/:appointmentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete appointment' })
  async deleteAppointment(
    @Param('userId') userId: string,
    @Param('appointmentId') appointmentId: string,
    @CurrentUser() currentUser,
  ) {
    if (userId !== currentUser.id && !currentUser.roles.includes(UserRole.CAREGIVER) && !currentUser.roles.includes(UserRole.ADMIN)) {
      throw new Error('Unauthorized to delete appointment for this user');
    }

    await this.profileService.deleteAppointment(userId, appointmentId);

    return {
      message: 'Appointment deleted successfully',
    };
  }
}

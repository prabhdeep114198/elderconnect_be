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
import { NotificationService, CreateNotificationDto } from './notification.service';
import { NotificationStatus, NotificationCategory } from './entities/notification.entity';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuditLogInterceptor } from '../common/interceptors/audit-log.interceptor';
import { UserRole } from '../common/enums/user-role.enum';

@ApiTags('Notifications')
@Controller('v1/notifications')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@UseInterceptors(AuditLogInterceptor)
@ApiBearerAuth()
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  // Core Notification Endpoints
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new notification' })
  @ApiResponse({ status: 201, description: 'Notification created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid notification data' })
  async createNotification(
    @Body() createDto: CreateNotificationDto,
    @CurrentUser() currentUser,
  ) {
    // Users can only create notifications for themselves, or caregivers/admins can create for others
    if (createDto.userId !== currentUser.id && 
        !currentUser.roles.includes(UserRole.CAREGIVER) && 
        !currentUser.roles.includes(UserRole.ADMIN)) {
      throw new Error('Unauthorized to create notification for this user');
    }

    const notification = await this.notificationService.createNotification(createDto);

    return {
      message: 'Notification created successfully',
      data: { notification },
    };
  }

  @Post('template/:templateName')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create notification from template' })
  @ApiResponse({ status: 201, description: 'Notification created from template successfully' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async createFromTemplate(
    @Param('templateName') templateName: string,
    @Body() body: {
      userId: string;
      variables: Record<string, any>;
      recipientId?: string;
      recipient?: string;
      scheduledAt?: string;
      priority?: string;
    },
    @CurrentUser() currentUser,
  ) {
    if (body.userId !== currentUser.id && 
        !currentUser.roles.includes(UserRole.CAREGIVER) && 
        !currentUser.roles.includes(UserRole.ADMIN)) {
      throw new Error('Unauthorized to create notification for this user');
    }

    const notification = await this.notificationService.createFromTemplate(
      templateName,
      body.userId,
      body.variables,
      {
        recipientId: body.recipientId,
        recipient: body.recipient,
        scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : undefined,
        priority: body.priority as any,
      },
    );

    return {
      message: 'Notification created from template successfully',
      data: { notification },
    };
  }

  @Get()
  @ApiOperation({ summary: 'Get user notifications' })
  @ApiQuery({ name: 'status', required: false, enum: NotificationStatus })
  @ApiQuery({ name: 'category', required: false, enum: NotificationCategory })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiQuery({ name: 'includeRead', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: 'Notifications retrieved successfully' })
  async getNotifications(
    @Query('status') status?: NotificationStatus,
    @Query('category') category?: NotificationCategory,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
    @Query('includeRead') includeRead?: boolean,
    @CurrentUser() currentUser,
  ) {
    const result = await this.notificationService.getNotifications(currentUser.id, {
      status,
      category,
      limit,
      offset,
      includeRead,
    });

    return {
      message: 'Notifications retrieved successfully',
      data: result,
    };
  }

  @Put(':notificationId/read')
  @ApiOperation({ summary: 'Mark notification as read' })
  @ApiResponse({ status: 200, description: 'Notification marked as read' })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  async markAsRead(
    @Param('notificationId') notificationId: string,
    @CurrentUser() currentUser,
  ) {
    const notification = await this.notificationService.markAsRead(
      currentUser.id,
      notificationId,
    );

    return {
      message: 'Notification marked as read',
      data: { notification },
    };
  }

  @Put('read-all')
  @ApiOperation({ summary: 'Mark all notifications as read' })
  @ApiResponse({ status: 200, description: 'All notifications marked as read' })
  async markAllAsRead(@CurrentUser() currentUser) {
    const count = await this.notificationService.markAllAsRead(currentUser.id);

    return {
      message: 'All notifications marked as read',
      data: { count },
    };
  }

  @Delete(':notificationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete notification' })
  @ApiResponse({ status: 204, description: 'Notification deleted successfully' })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  async deleteNotification(
    @Param('notificationId') notificationId: string,
    @CurrentUser() currentUser,
  ) {
    await this.notificationService.deleteNotification(currentUser.id, notificationId);

    return {
      message: 'Notification deleted successfully',
    };
  }

  // Emergency Notification Endpoints
  @Post('emergency-alert')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Send emergency alert to contacts' })
  @ApiResponse({ status: 201, description: 'Emergency alert sent successfully' })
  async sendEmergencyAlert(
    @Body() body: {
      userId: string;
      emergencyContacts: { phone?: string; pushToken?: string }[];
      alertType: string;
      message: string;
      location?: { latitude: number; longitude: number };
    },
    @CurrentUser() currentUser,
  ) {
    if (body.userId !== currentUser.id && 
        !currentUser.roles.includes(UserRole.CAREGIVER) && 
        !currentUser.roles.includes(UserRole.ADMIN)) {
      throw new Error('Unauthorized to send emergency alert for this user');
    }

    const notifications = await this.notificationService.sendEmergencyAlert(
      body.userId,
      body.emergencyContacts,
      body.alertType,
      body.message,
      body.location,
    );

    return {
      message: 'Emergency alert sent successfully',
      data: { notifications, count: notifications.length },
    };
  }

  // Medication Reminder Endpoints
  @Post('medication-reminder')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Schedule medication reminder' })
  @ApiResponse({ status: 201, description: 'Medication reminder scheduled successfully' })
  async scheduleMedicationReminder(
    @Body() body: {
      userId: string;
      medicationName: string;
      dosage: string;
      scheduledTime: string;
      recipients: { phone?: string; pushToken?: string };
    },
    @CurrentUser() currentUser,
  ) {
    if (body.userId !== currentUser.id && 
        !currentUser.roles.includes(UserRole.CAREGIVER) && 
        !currentUser.roles.includes(UserRole.ADMIN)) {
      throw new Error('Unauthorized to schedule reminder for this user');
    }

    const notifications = await this.notificationService.scheduleMedicationReminder(
      body.userId,
      body.medicationName,
      body.dosage,
      new Date(body.scheduledTime),
      body.recipients,
    );

    return {
      message: 'Medication reminder scheduled successfully',
      data: { notifications, count: notifications.length },
    };
  }

  // Template Management Endpoints
  @Get('templates')
  @ApiOperation({ summary: 'Get notification templates' })
  @ApiQuery({ name: 'category', required: false, enum: NotificationCategory })
  @ApiResponse({ status: 200, description: 'Templates retrieved successfully' })
  async getTemplates(
    @Query('category') category?: NotificationCategory,
    @CurrentUser() currentUser,
  ) {
    const templates = await this.notificationService.getTemplates(category);

    return {
      message: 'Templates retrieved successfully',
      data: { templates },
    };
  }

  @Post('templates')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create notification template (Admin only)' })
  @ApiResponse({ status: 201, description: 'Template created successfully' })
  async createTemplate(
    @Body() templateData: any,
    @CurrentUser() currentUser,
  ) {
    const template = await this.notificationService.createTemplate(templateData);

    return {
      message: 'Template created successfully',
      data: { template },
    };
  }

  // Analytics Endpoints
  @Get('stats')
  @ApiOperation({ summary: 'Get notification statistics' })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Statistics retrieved successfully' })
  async getNotificationStats(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @CurrentUser() currentUser,
  ) {
    const stats = await this.notificationService.getNotificationStats(
      currentUser.id,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );

    return {
      message: 'Statistics retrieved successfully',
      data: stats,
    };
  }

  // Admin/Caregiver Endpoints
  @Get('users/:userId')
  @Roles(UserRole.CAREGIVER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get notifications for specific user (Caregiver/Admin only)' })
  @ApiResponse({ status: 200, description: 'User notifications retrieved successfully' })
  async getUserNotifications(
    @Param('userId') userId: string,
    @Query('status') status?: NotificationStatus,
    @Query('category') category?: NotificationCategory,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
    @CurrentUser() currentUser,
  ) {
    const result = await this.notificationService.getNotifications(userId, {
      status,
      category,
      limit,
      offset,
    });

    return {
      message: 'User notifications retrieved successfully',
      data: result,
    };
  }

  @Get('stats/global')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get global notification statistics (Admin only)' })
  @ApiResponse({ status: 200, description: 'Global statistics retrieved successfully' })
  async getGlobalStats(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @CurrentUser() currentUser,
  ) {
    const stats = await this.notificationService.getNotificationStats(
      undefined, // No specific user - global stats
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );

    return {
      message: 'Global statistics retrieved successfully',
      data: stats,
    };
  }

  @Post(':notificationId/resend')
  @Roles(UserRole.CAREGIVER, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend failed notification (Caregiver/Admin only)' })
  @ApiResponse({ status: 200, description: 'Notification resent successfully' })
  async resendNotification(
    @Param('notificationId') notificationId: string,
    @CurrentUser() currentUser,
  ) {
    const success = await this.notificationService.sendNotification(notificationId);

    return {
      message: success ? 'Notification resent successfully' : 'Failed to resend notification',
      data: { success },
    };
  }
}

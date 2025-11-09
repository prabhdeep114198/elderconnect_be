import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, MoreThan, Between } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Notification, NotificationType, NotificationStatus, NotificationCategory } from './entities/notification.entity';
import { NotificationTemplate } from './entities/notification-template.entity';
import { TwilioService } from './services/twilio.service';
import { FCMService } from './services/fcm.service';
import { KafkaService } from '../device/services/kafka.service';
import { AlertPriority } from '../common/enums/user-role.enum';

export interface CreateNotificationDto {
  userId: string;
  recipientId?: string;
  type: NotificationType;
  category: NotificationCategory;
  title: string;
  message: string;
  recipient?: string;
  priority?: AlertPriority;
  data?: Record<string, any>;
  scheduledAt?: Date;
  expirationHours?: number;
}

export interface NotificationStats {
  total: number;
  sent: number;
  delivered: number;
  failed: number;
  pending: number;
  byType: Record<string, number>;
  byCategory: Record<string, number>;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectRepository(Notification, 'audit')
    private readonly notificationRepository: Repository<Notification>,
    @InjectRepository(NotificationTemplate, 'audit')
    private readonly templateRepository: Repository<NotificationTemplate>,
    private readonly twilioService: TwilioService,
    private readonly fcmService: FCMService,
    private readonly kafkaService: KafkaService,
  ) {}

  // Core Notification Methods
  async createNotification(createDto: CreateNotificationDto): Promise<Notification> {
    const notification = this.notificationRepository.create({
      ...createDto,
      priority: createDto.priority || AlertPriority.MEDIUM,
    });

    if (createDto.expirationHours) {
      notification.setExpiration(createDto.expirationHours);
    }

    const savedNotification = await this.notificationRepository.save(notification);

    // If not scheduled, send immediately
    if (!createDto.scheduledAt) {
      await this.sendNotification(savedNotification.id);
    }

    return savedNotification;
  }

  async createFromTemplate(
    templateName: string,
    userId: string,
    variables: Record<string, any>,
    options?: {
      recipientId?: string;
      recipient?: string;
      scheduledAt?: Date;
      priority?: AlertPriority;
    },
  ): Promise<Notification> {
    const template = await this.templateRepository.findOne({
      where: { name: templateName, isActive: true },
    });

    if (!template) {
      throw new NotFoundException(`Template '${templateName}' not found`);
    }

    // Validate variables
    const validation = template.validateVariables(variables);
    if (!validation.isValid) {
      throw new BadRequestException(`Template validation failed: ${validation.errors.join(', ')}`);
    }

    // Render template
    const title = template.renderTitle(variables);
    const message = template.renderMessage(variables);

    const notification = await this.createNotification({
      userId,
      recipientId: options?.recipientId,
      type: template.type,
      category: template.category,
      title,
      message,
      recipient: options?.recipient,
      priority: options?.priority || template.defaultPriority,
      data: { templateName, variables, ...template.defaultData },
      scheduledAt: options?.scheduledAt,
      expirationHours: template.expirationHours,
    });

    return notification;
  }

  async sendNotification(notificationId: string): Promise<boolean> {
    const notification = await this.notificationRepository.findOne({
      where: { id: notificationId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (notification.status !== NotificationStatus.PENDING) {
      this.logger.warn(`Notification ${notificationId} is not in pending status`);
      return false;
    }

    if (notification.isExpired) {
      notification.status = NotificationStatus.CANCELLED;
      await this.notificationRepository.save(notification);
      return false;
    }

    try {
      let result: any;

      switch (notification.type) {
        case NotificationType.SMS:
          result = await this.sendSMSNotification(notification);
          break;
        case NotificationType.PUSH:
          result = await this.sendPushNotification(notification);
          break;
        case NotificationType.VOICE_CALL:
          result = await this.sendVoiceCallNotification(notification);
          break;
        case NotificationType.EMAIL:
          result = await this.sendEmailNotification(notification);
          break;
        case NotificationType.IN_APP:
          result = await this.sendInAppNotification(notification);
          break;
        default:
          throw new BadRequestException(`Unsupported notification type: ${notification.type}`);
      }

      if (result.success) {
        notification.markAsSent(result.messageId || result.callId);
        
        // For some types, we can immediately mark as delivered
        if (notification.type === NotificationType.IN_APP) {
          notification.markAsDelivered();
        }
      } else {
        notification.markAsFailed(result.error || 'Unknown error');
      }

      await this.notificationRepository.save(notification);
      return result.success;
    } catch (error) {
      this.logger.error(`Failed to send notification ${notificationId}:`, error);
      notification.markAsFailed(error.message);
      await this.notificationRepository.save(notification);
      return false;
    }
  }

  private async sendSMSNotification(notification: Notification): Promise<any> {
    if (!notification.recipient) {
      throw new BadRequestException('SMS recipient phone number is required');
    }

    return this.twilioService.sendSMS(
      notification.recipient,
      notification.message,
      notification.priority,
    );
  }

  private async sendPushNotification(notification: Notification): Promise<any> {
    if (!notification.recipient) {
      throw new BadRequestException('Push notification token is required');
    }

    return this.fcmService.sendPushNotification(
      notification.recipient,
      {
        title: notification.title,
        body: notification.message,
        data: notification.data ? Object.fromEntries(
          Object.entries(notification.data).map(([k, v]) => [k, String(v)])
        ) : undefined,
      },
      notification.priority,
    );
  }

  private async sendVoiceCallNotification(notification: Notification): Promise<any> {
    if (!notification.recipient) {
      throw new BadRequestException('Voice call recipient phone number is required');
    }

    return this.twilioService.makeVoiceCall(
      notification.recipient,
      notification.message,
      notification.priority,
    );
  }

  private async sendEmailNotification(notification: Notification): Promise<any> {
    // Email service would be implemented here
    // For now, return a mock success
    return { success: true, messageId: `email_${Date.now()}` };
  }

  private async sendInAppNotification(notification: Notification): Promise<any> {
    // Publish to Kafka for real-time delivery to connected clients
    await this.kafkaService.publishNotification(notification.userId, {
      id: notification.id,
      type: notification.type,
      category: notification.category,
      title: notification.title,
      message: notification.message,
      priority: notification.priority,
      data: notification.data,
      createdAt: notification.createdAt,
    });

    return { success: true, messageId: `in_app_${notification.id}` };
  }

  // Notification Management
  async getNotifications(
    userId: string,
    options?: {
      status?: NotificationStatus;
      category?: NotificationCategory;
      limit?: number;
      offset?: number;
      includeRead?: boolean;
    },
  ): Promise<{ notifications: Notification[]; total: number }> {
    const whereCondition: any = { userId };

    if (options?.status) {
      whereCondition.status = options.status;
    }

    if (options?.category) {
      whereCondition.category = options.category;
    }

    if (!options?.includeRead) {
      whereCondition.isRead = false;
    }

    const [notifications, total] = await this.notificationRepository.findAndCount({
      where: whereCondition,
      order: { createdAt: 'DESC' },
      take: options?.limit || 50,
      skip: options?.offset || 0,
    });

    return { notifications, total };
  }

  async markAsRead(userId: string, notificationId: string): Promise<Notification> {
    const notification = await this.notificationRepository.findOne({
      where: { id: notificationId, userId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    notification.markAsRead();
    return this.notificationRepository.save(notification);
  }

  async markAllAsRead(userId: string): Promise<number> {
    const result = await this.notificationRepository.update(
      { userId, isRead: false },
      { isRead: true, readAt: new Date() },
    );

    return result.affected || 0;
  }

  async deleteNotification(userId: string, notificationId: string): Promise<void> {
    const notification = await this.notificationRepository.findOne({
      where: { id: notificationId, userId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    await this.notificationRepository.remove(notification);
  }

  // Emergency Notifications
  async sendEmergencyAlert(
    userId: string,
    emergencyContacts: { phone?: string; pushToken?: string }[],
    alertType: string,
    message: string,
    location?: { latitude: number; longitude: number },
  ): Promise<Notification[]> {
    const notifications: Notification[] = [];

    for (const contact of emergencyContacts) {
      // Send SMS if phone number available
      if (contact.phone) {
        const smsNotification = await this.createNotification({
          userId,
          type: NotificationType.SMS,
          category: NotificationCategory.SOS_ALERT,
          title: `🚨 EMERGENCY ALERT`,
          message: location 
            ? `${message} Location: https://maps.google.com/?q=${location.latitude},${location.longitude}`
            : message,
          recipient: contact.phone,
          priority: AlertPriority.CRITICAL,
          data: { alertType, location },
          expirationHours: 24,
        });
        notifications.push(smsNotification);
      }

      // Send push notification if token available
      if (contact.pushToken) {
        const pushNotification = await this.createNotification({
          userId,
          type: NotificationType.PUSH,
          category: NotificationCategory.SOS_ALERT,
          title: `🚨 EMERGENCY ALERT`,
          message,
          recipient: contact.pushToken,
          priority: AlertPriority.CRITICAL,
          data: { alertType, location },
          expirationHours: 24,
        });
        notifications.push(pushNotification);
      }
    }

    return notifications;
  }

  // Scheduled Notifications and Reminders
  async scheduleMedicationReminder(
    userId: string,
    medicationName: string,
    dosage: string,
    scheduledTime: Date,
    recipients: { phone?: string; pushToken?: string },
  ): Promise<Notification[]> {
    const notifications: Notification[] = [];
    const message = `Time to take ${medicationName} (${dosage})`;

    if (recipients.pushToken) {
      const pushNotification = await this.createNotification({
        userId,
        type: NotificationType.PUSH,
        category: NotificationCategory.MEDICATION_REMINDER,
        title: '💊 Medication Reminder',
        message,
        recipient: recipients.pushToken,
        priority: AlertPriority.HIGH,
        scheduledAt: scheduledTime,
        data: { medicationName, dosage },
      });
      notifications.push(pushNotification);
    }

    if (recipients.phone) {
      const smsNotification = await this.createNotification({
        userId,
        type: NotificationType.SMS,
        category: NotificationCategory.MEDICATION_REMINDER,
        title: 'Medication Reminder',
        message,
        recipient: recipients.phone,
        priority: AlertPriority.HIGH,
        scheduledAt: new Date(scheduledTime.getTime() + 5 * 60 * 1000), // 5 minutes after push
        data: { medicationName, dosage },
      });
      notifications.push(smsNotification);
    }

    return notifications;
  }

  // Background Jobs
  @Cron(CronExpression.EVERY_MINUTE)
  async processScheduledNotifications(): Promise<void> {
    const now = new Date();
    const scheduledNotifications = await this.notificationRepository.find({
      where: {
        status: NotificationStatus.PENDING,
        scheduledAt: MoreThan(new Date(0)), // Has a scheduled time
      },
      take: 100,
    });

    const dueNotifications = scheduledNotifications.filter(
      notification => notification.scheduledAt && notification.scheduledAt <= now
    );

    for (const notification of dueNotifications) {
      try {
        await this.sendNotification(notification.id);
      } catch (error) {
        this.logger.error(`Failed to send scheduled notification ${notification.id}:`, error);
      }
    }

    if (dueNotifications.length > 0) {
      this.logger.log(`Processed ${dueNotifications.length} scheduled notifications`);
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async retryFailedNotifications(): Promise<void> {
    const failedNotifications = await this.notificationRepository.find({
      where: {
        status: NotificationStatus.FAILED,
      },
      take: 50,
    });

    const retryableNotifications = failedNotifications.filter(n => n.canRetry);

    for (const notification of retryableNotifications) {
      try {
        notification.status = NotificationStatus.PENDING;
        await this.notificationRepository.save(notification);
        await this.sendNotification(notification.id);
      } catch (error) {
        this.logger.error(`Failed to retry notification ${notification.id}:`, error);
      }
    }

    if (retryableNotifications.length > 0) {
      this.logger.log(`Retried ${retryableNotifications.length} failed notifications`);
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async cleanupExpiredNotifications(): Promise<void> {
    const expiredNotifications = await this.notificationRepository.find({
      where: {
        status: In([NotificationStatus.PENDING, NotificationStatus.FAILED]),
      },
    });

    const actuallyExpired = expiredNotifications.filter(n => n.isExpired);

    for (const notification of actuallyExpired) {
      notification.status = NotificationStatus.CANCELLED;
    }

    if (actuallyExpired.length > 0) {
      await this.notificationRepository.save(actuallyExpired);
      this.logger.log(`Cancelled ${actuallyExpired.length} expired notifications`);
    }
  }

  // Analytics and Reporting
  async getNotificationStats(
    userId?: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<NotificationStats> {
    const whereCondition: any = {};

    if (userId) {
      whereCondition.userId = userId;
    }

    if (startDate && endDate) {
      whereCondition.createdAt = Between(startDate, endDate);
    }

    const notifications = await this.notificationRepository.find({
      where: whereCondition,
    });

    const stats: NotificationStats = {
      total: notifications.length,
      sent: notifications.filter(n => n.status === NotificationStatus.SENT || n.status === NotificationStatus.DELIVERED).length,
      delivered: notifications.filter(n => n.status === NotificationStatus.DELIVERED).length,
      failed: notifications.filter(n => n.status === NotificationStatus.FAILED).length,
      pending: notifications.filter(n => n.status === NotificationStatus.PENDING).length,
      byType: {},
      byCategory: {},
    };

    // Group by type
    notifications.forEach(n => {
      stats.byType[n.type] = (stats.byType[n.type] || 0) + 1;
      stats.byCategory[n.category] = (stats.byCategory[n.category] || 0) + 1;
    });

    return stats;
  }

  // Template Management
  async createTemplate(templateData: Partial<NotificationTemplate>): Promise<NotificationTemplate> {
    const template = this.templateRepository.create(templateData);
    return this.templateRepository.save(template);
  }

  async getTemplates(category?: NotificationCategory): Promise<NotificationTemplate[]> {
    const whereCondition: any = { isActive: true };

    if (category) {
      whereCondition.category = category;
    }

    return this.templateRepository.find({
      where: whereCondition,
      order: { name: 'ASC' },
    });
  }
}

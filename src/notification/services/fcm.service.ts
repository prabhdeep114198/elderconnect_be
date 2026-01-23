import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

export interface PushNotificationResult {
  success: boolean;
  messageId?: string;
  error?: string;
  failureCount?: number;
  successCount?: number;
}

export interface PushNotificationPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
  imageUrl?: string;
  clickAction?: string;
  sound?: string;
  badge?: number;
}

@Injectable()
export class FCMService {
  private readonly logger = new Logger(FCMService.name);

  constructor(private readonly configService: ConfigService) { }


  async sendPushNotification(
    token: string,
    payload: PushNotificationPayload,
    priority: string = 'normal',
  ): Promise<PushNotificationResult> {
    if (admin.apps.length === 0) {
      return {
        success: false,
        error: 'Firebase service not configured',
      };
    }

    try {
      const message: admin.messaging.Message = {
        token,
        notification: {
          title: payload.title,
          body: payload.body,
          imageUrl: payload.imageUrl,
        },
        data: payload.data || {},
        android: {
          priority: priority === 'critical' || priority === 'high' ? 'high' : 'normal',
          notification: {
            sound: payload.sound || 'default',
            clickAction: payload.clickAction,
            channelId: this.getChannelId(priority),
          },
        },
        apns: {
          payload: {
            aps: {
              sound: payload.sound || 'default',
              badge: payload.badge,
              contentAvailable: true,
            },
          },
        },
        webpush: {
          notification: {
            title: payload.title,
            body: payload.body,
            icon: '/assets/icons/notification-icon.png',
            badge: '/assets/icons/badge-icon.png',
            image: payload.imageUrl,
            requireInteraction: priority === 'critical',
          },
          fcmOptions: {
            link: payload.clickAction,
          },
        },
      };

      const response = await admin.messaging().send(message);

      this.logger.log(`Push notification sent successfully, Message ID: ${response}`);

      return {
        success: true,
        messageId: response,
      };
    } catch (error) {
      this.logger.error('Failed to send push notification:', error);

      return {
        success: false,
        error: error.message || 'Unknown error occurred',
      };
    }
  }

  async sendMulticastNotification(
    tokens: string[],
    payload: PushNotificationPayload,
    priority: string = 'normal',
  ): Promise<PushNotificationResult> {
    if (admin.apps.length === 0) {
      return {
        success: false,
        error: 'Firebase service not configured',
      };
    }

    if (tokens.length === 0) {
      return {
        success: false,
        error: 'No tokens provided',
      };
    }

    try {
      const message: admin.messaging.MulticastMessage = {
        tokens,
        notification: {
          title: payload.title,
          body: payload.body,
          imageUrl: payload.imageUrl,
        },
        data: payload.data || {},
        android: {
          priority: priority === 'critical' || priority === 'high' ? 'high' : 'normal',
          notification: {
            sound: payload.sound || 'default',
            clickAction: payload.clickAction,
            channelId: this.getChannelId(priority),
          },
        },
        apns: {
          payload: {
            aps: {
              sound: payload.sound || 'default',
              badge: payload.badge,
              contentAvailable: true,
            },
          },
        },
      };

      const response = await admin.messaging().sendEachForMulticast(message);


      this.logger.log(`Multicast notification sent - Success: ${response.successCount}, Failure: ${response.failureCount}`);

      // Log individual failures
      if (response.failureCount > 0) {
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            this.logger.error(`Failed to send to token ${tokens[idx]}: ${resp.error?.message}`);
          }
        });
      }

      return {
        success: response.successCount > 0,
        successCount: response.successCount,
        failureCount: response.failureCount,
      };
    } catch (error) {
      this.logger.error('Failed to send multicast notification:', error);

      return {
        success: false,
        error: error.message || 'Unknown error occurred',
      };
    }
  }

  async sendToTopic(
    topic: string,
    payload: PushNotificationPayload,
    priority: string = 'normal',
  ): Promise<PushNotificationResult> {
    if (admin.apps.length === 0) {
      return {
        success: false,
        error: 'Firebase service not configured',
      };
    }

    try {
      const message: admin.messaging.Message = {
        topic,
        notification: {
          title: payload.title,
          body: payload.body,
          imageUrl: payload.imageUrl,
        },
        data: payload.data || {},
        android: {
          priority: priority === 'critical' || priority === 'high' ? 'high' : 'normal',
          notification: {
            sound: payload.sound || 'default',
            channelId: this.getChannelId(priority),
          },
        },
        apns: {
          payload: {
            aps: {
              sound: payload.sound || 'default',
              contentAvailable: true,
            },
          },
        },
      };

      const response = await admin.messaging().send(message);

      this.logger.log(`Topic notification sent successfully to ${topic}, Message ID: ${response}`);

      return {
        success: true,
        messageId: response,
      };
    } catch (error) {
      this.logger.error(`Failed to send topic notification to ${topic}:`, error);

      return {
        success: false,
        error: error.message || 'Unknown error occurred',
      };
    }
  }

  async subscribeToTopic(tokens: string[], topic: string): Promise<void> {
    if (admin.apps.length === 0) {
      throw new Error('Firebase service not configured');
    }

    try {
      const response = await admin.messaging().subscribeToTopic(tokens, topic);
      this.logger.log(`Subscribed ${response.successCount} tokens to topic ${topic}`);

      if (response.failureCount > 0) {
        this.logger.warn(`Failed to subscribe ${response.failureCount} tokens to topic ${topic}`);
      }
    } catch (error) {
      this.logger.error(`Failed to subscribe to topic ${topic}:`, error);
      throw error;
    }
  }

  async unsubscribeFromTopic(tokens: string[], topic: string): Promise<void> {
    if (admin.apps.length === 0) {
      throw new Error('Firebase service not configured');
    }

    try {
      const response = await admin.messaging().unsubscribeFromTopic(tokens, topic);
      this.logger.log(`Unsubscribed ${response.successCount} tokens from topic ${topic}`);

      if (response.failureCount > 0) {
        this.logger.warn(`Failed to unsubscribe ${response.failureCount} tokens from topic ${topic}`);
      }
    } catch (error) {
      this.logger.error(`Failed to unsubscribe from topic ${topic}:`, error);
      throw error;
    }
  }

  async validateToken(token: string): Promise<boolean> {
    if (admin.apps.length === 0) {
      return false;
    }

    try {
      // Try to send a test message to validate the token
      const testMessage: admin.messaging.Message = {
        token,
        data: { test: 'true' },
        android: { priority: 'normal' },
      };

      await admin.messaging().send(testMessage, true); // dry run
      return true;
    } catch (error) {
      this.logger.warn(`Invalid FCM token: ${token}`);
      return false;
    }
  }

  private getChannelId(priority: string): string {
    switch (priority) {
      case 'critical':
        return 'emergency_alerts';
      case 'high':
        return 'high_priority';
      case 'medium':
        return 'medium_priority';
      case 'low':
        return 'low_priority';
      default:
        return 'default';
    }
  }

  // Emergency notification methods
  async sendEmergencyNotification(
    tokens: string[],
    title: string,
    message: string,
    location?: { latitude: number; longitude: number },
  ): Promise<PushNotificationResult> {
    const payload: PushNotificationPayload = {
      title: `🚨 EMERGENCY: ${title}`,
      body: message,
      sound: 'emergency_alert',
      data: {
        type: 'emergency',
        priority: 'critical',
        ...(location && {
          latitude: location.latitude.toString(),
          longitude: location.longitude.toString(),
        }),
      },
      clickAction: '/emergency',
    };

    return this.sendMulticastNotification(tokens, payload, 'critical');
  }

  async sendMedicationReminder(
    token: string,
    medicationName: string,
    dosage: string,
    scheduledTime: string,
  ): Promise<PushNotificationResult> {
    const payload: PushNotificationPayload = {
      title: '💊 Medication Reminder',
      body: `Time to take ${medicationName} (${dosage})`,
      sound: 'medication_reminder',
      data: {
        type: 'medication_reminder',
        medicationName,
        dosage,
        scheduledTime,
      },
      clickAction: '/medications',
    };

    return this.sendPushNotification(token, payload, 'high');
  }

  async sendAppointmentReminder(
    token: string,
    doctorName: string,
    appointmentTime: string,
    location: string,
  ): Promise<PushNotificationResult> {
    const payload: PushNotificationPayload = {
      title: '📅 Appointment Reminder',
      body: `Appointment with ${doctorName} at ${appointmentTime}`,
      data: {
        type: 'appointment_reminder',
        doctorName,
        appointmentTime,
        location,
      },
      clickAction: '/appointments',
    };

    return this.sendPushNotification(token, payload, 'medium');
  }

  async sendHealthAlert(
    tokens: string[],
    alertType: string,
    message: string,
    severity: string,
  ): Promise<PushNotificationResult> {
    const payload: PushNotificationPayload = {
      title: `⚠️ Health Alert: ${alertType}`,
      body: message,
      sound: severity === 'high' ? 'health_alert_high' : 'health_alert',
      data: {
        type: 'health_alert',
        alertType,
        severity,
      },
      clickAction: '/health',
    };

    return this.sendMulticastNotification(tokens, payload, severity);
  }

  async sendFamilyUpdate(
    tokens: string[],
    elderName: string,
    updateType: string,
    message: string,
  ): Promise<PushNotificationResult> {
    const payload: PushNotificationPayload = {
      title: `👨‍👩‍👧‍👦 Update: ${elderName}`,
      body: message,
      data: {
        type: 'family_update',
        elderName,
        updateType,
      },
      clickAction: '/family',
    };

    return this.sendMulticastNotification(tokens, payload, 'medium');
  }
}

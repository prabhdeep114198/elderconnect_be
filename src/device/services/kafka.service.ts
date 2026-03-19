import { Injectable, Logger } from '@nestjs/common';

export interface TelemetryMessage {
  userId: string;
  deviceId: string;
  metricType: string;
  value: Record<string, any>;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface AlertMessage {
  alertId: string;
  userId: string;
  deviceId?: string;
  type: string;
  priority: string;
  description: string;
  location?: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  contextData?: Record<string, any>;
  timestamp: Date;
}

@Injectable()
export class KafkaService {
  private readonly logger = new Logger(KafkaService.name);

  constructor() {
    this.logger.warn('Kafka has been permanently disabled in this application.');
  }

  async publishTelemetry(message: TelemetryMessage): Promise<void> {
    this.logger.debug(`[DUMMY] Telemetry published for user ${message.userId}`);
  }

  async publishAlert(message: AlertMessage): Promise<void> {
    this.logger.debug(`[DUMMY] Alert published: ${message.type} for user ${message.userId}`);
  }

  async publishVitals(userId: string, vitalsData: Record<string, any>): Promise<void> {
    this.logger.debug(`[DUMMY] Vitals published for user ${userId}`);
  }

  async publishNotification(userId: string, notification: Record<string, any>): Promise<void> {
    this.logger.debug(`[DUMMY] Notification published for user ${userId}`);
  }

  setNotificationHandler(handler: (data: any) => Promise<void>) {
    this.logger.warn('[DUMMY] setNotificationHandler called');
  }

  async getTopicMetadata(topic: string): Promise<any> {
    return [];
  }

  async createTopics(topics: string[]): Promise<void> {
    this.logger.debug(`[DUMMY] Creating topics: ${topics.join(', ')}`);
  }
}

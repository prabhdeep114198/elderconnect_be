import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Producer, Consumer, EachMessagePayload } from 'kafkajs';

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
export class KafkaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaService.name);
  private kafka: Kafka;
  private producer: Producer;
  private consumer: Consumer;
  private readonly topics = {
    telemetry: 'elder-telemetry',
    alerts: 'elder-alerts',
    vitals: 'elder-vitals',
    notifications: 'elder-notifications',
  };

  constructor(private readonly configService: ConfigService) {
    // -----------------------------
    // Brokers setup
    // -----------------------------
    // This line throws error if brokers are not configured
    // const brokers = this.configService.get<string>('KAFKA_BROKERS')?.split(','); 
    // if (!brokers || brokers.length === 0) {
    //   throw new Error('Kafka brokers are not configured (kafka.brokers)');
    // }

    // Safe default if env variable is missing
    const brokers = this.configService.get<string>('KAFKA_BROKERS')?.split(',') || ['localhost:9092'];

    this.kafka = new Kafka({
      clientId: this.configService.get<string>('kafka.clientId') || 'elder-connect-client', // default clientId
      brokers,
      retry: {
        initialRetryTime: 100,
        retries: 8,
      },
    });

    // -----------------------------
    // Producer setup
    // -----------------------------
    this.producer = this.kafka.producer({
      maxInFlightRequests: 1,
      idempotent: true,
      transactionTimeout: 30000,
    });

    // -----------------------------
    // GroupId setup for consumer
    // -----------------------------
    // This line throws error if groupId is not configured
    // const groupId = this.configService.get<string>('kafka.groupId');
    // if (!groupId) {
    //   throw new Error('Kafka groupId is not configured (kafka.groupId)');
    // }

    // Safe default if env variable is missing
    const groupId = this.configService.get<string>('kafka.groupId') || 'default-group';

    // -----------------------------
    // Consumer setup
    // -----------------------------
    this.consumer = this.kafka.consumer({
      groupId,
      sessionTimeout: 30000,
      heartbeatInterval: 3000,
    });
  }

  private isConnected = false;

  async onModuleInit() {
    try {
      this.logger.log('Connecting to Kafka...');
      await this.producer.connect();
      await this.consumer.connect();

      // Subscribe to all topics
      await this.consumer.subscribe({
        topics: Object.values(this.topics),
        fromBeginning: false
      });

      // Start consuming messages
      await this.consumer.run({
        eachMessage: this.handleMessage.bind(this),
      });

      this.isConnected = true;
      this.logger.log('Kafka service initialized successfully');
    } catch (error) {
      this.logger.warn('Failed to initialize Kafka service - Kafka features will be disabled. Error: ' + error.message);
      // We do NOT throw here, allowing the app to start without Kafka
      this.isConnected = false;
    }
  }

  async onModuleDestroy() {
    if (!this.isConnected) return;
    try {
      await this.producer.disconnect();
      await this.consumer.disconnect();
      this.logger.log('Kafka service disconnected');
    } catch (error) {
      this.logger.error('Error disconnecting Kafka service', error);
    }
  }

  // -----------------------------
  // Producer methods
  // -----------------------------
  async publishTelemetry(message: TelemetryMessage): Promise<void> {
    if (!this.isConnected) return;
    try {
      await this.producer.send({
        topic: this.topics.telemetry,
        messages: [{
          key: `${message.userId}-${message.deviceId}`,
          value: JSON.stringify(message),
          timestamp: message.timestamp.getTime().toString(),
          headers: {
            userId: message.userId,
            deviceId: message.deviceId,
            metricType: message.metricType,
          },
        }],
      });

      this.logger.debug(`Telemetry published for user ${message.userId}`);
    } catch (error) {
      this.logger.error('Failed to publish telemetry message', error);
      throw error;
    }
  }

  async publishAlert(message: AlertMessage): Promise<void> {
    if (!this.isConnected) return;
    try {
      await this.producer.send({
        topic: this.topics.alerts,
        messages: [{
          key: message.alertId,
          value: JSON.stringify(message),
          timestamp: message.timestamp.getTime().toString(),
          headers: {
            userId: message.userId,
            alertType: message.type,
            priority: message.priority,
          },
        }],
      });

      this.logger.log(`Alert published: ${message.type} for user ${message.userId}`);
    } catch (error) {
      this.logger.error('Failed to publish alert message', error);
      throw error;
    }
  }

  async publishVitals(userId: string, vitalsData: Record<string, any>): Promise<void> {
    if (!this.isConnected) return;
    try {
      const message = {
        userId,
        vitalsData,
        timestamp: new Date(),
      };

      await this.producer.send({
        topic: this.topics.vitals,
        messages: [{
          key: userId,
          value: JSON.stringify(message),
          headers: {
            userId,
            vitalType: vitalsData.vitalType,
          },
        }],
      });

      this.logger.debug(`Vitals published for user ${userId}`);
    } catch (error) {
      this.logger.error('Failed to publish vitals message', error);
      throw error;
    }
  }

  async publishNotification(userId: string, notification: Record<string, any>): Promise<void> {
    if (!this.isConnected) return;
    try {
      const message = {
        userId,
        notification,
        timestamp: new Date(),
      };

      await this.producer.send({
        topic: this.topics.notifications,
        messages: [{
          key: userId,
          value: JSON.stringify(message),
          headers: {
            userId,
            notificationType: notification.type,
            priority: notification.priority || 'medium',
          },
        }],
      });

      this.logger.debug(`Notification published for user ${userId}`);
    } catch (error) {
      this.logger.error('Failed to publish notification message', error);
      throw error;
    }
  }

  // -----------------------------
  // Consumer message handler
  // -----------------------------
  private async handleMessage({ topic, partition, message }: EachMessagePayload): Promise<void> {
    try {
      const value = message.value?.toString();
      if (!value) return;

      const data = JSON.parse(value);
      const headers = message.headers || {};

      this.logger.debug(`Processing message from topic: ${topic}`);

      switch (topic) {
        case this.topics.telemetry:
          await this.processTelemetryMessage(data, headers);
          break;
        case this.topics.alerts:
          await this.processAlertMessage(data, headers);
          break;
        case this.topics.vitals:
          await this.processVitalsMessage(data, headers);
          break;
        case this.topics.notifications:
          await this.processNotificationMessage(data, headers);
          break;
        default:
          this.logger.warn(`Unknown topic: ${topic}`);
      }
    } catch (error) {
      this.logger.error(`Error processing message from topic ${topic}`, error);
    }
  }

  private async processTelemetryMessage(data: any, headers: any): Promise<void> {
    this.logger.debug(`Processing telemetry: ${data.metricType} for user ${data.userId}`);
    if (this.isAnomalousReading(data)) {
      await this.publishAlert({
        alertId: `anomaly-${Date.now()}`,
        userId: data.userId,
        deviceId: data.deviceId,
        type: `${data.metricType}_anomaly`,
        priority: 'high',
        description: `Anomalous ${data.metricType} reading detected`,
        contextData: { reading: data.value, timestamp: data.timestamp },
        timestamp: new Date(),
      });
    }
  }

  private async processAlertMessage(data: any, headers: any): Promise<void> {
    this.logger.log(`Processing alert: ${data.type} for user ${data.userId}`);
    if (data.priority === 'critical' || data.priority === 'high') {
      await this.publishNotification(data.userId, {
        type: 'alert',
        title: 'Health Alert',
        message: data.description,
        priority: data.priority,
        alertId: data.alertId,
      });
    }
  }

  private async processVitalsMessage(data: any, headers: any): Promise<void> {
    this.logger.debug(`Processing vitals for user ${data.userId}`);
  }

  private async processNotificationMessage(data: any, headers: any): Promise<void> {
    this.logger.debug(`Processing notification for user ${data.userId}`);
  }

  private isAnomalousReading(data: TelemetryMessage): boolean {
    switch (data.metricType) {
      case 'heart_rate':
        const bpm = data.value.bpm;
        return bpm < 40 || bpm > 150;
      case 'blood_pressure':
        const systolic = data.value.systolic;
        const diastolic = data.value.diastolic;
        return systolic > 180 || systolic < 70 || diastolic > 110 || diastolic < 40;
      case 'temperature':
        const temp = data.value.celsius || data.value.fahrenheit;
        if (data.value.celsius) return temp < 35 || temp > 39;
        else if (data.value.fahrenheit) return temp < 95 || temp > 102;
        return false;
      default:
        return false;
    }
  }

  // -----------------------------
  // Utility methods
  // -----------------------------
  async getTopicMetadata(topic: string): Promise<any> {
    try {
      const admin = this.kafka.admin();
      await admin.connect();
      const metadata = await admin.fetchTopicMetadata({ topics: [topic] });
      await admin.disconnect();
      return metadata;
    } catch (error) {
      this.logger.error(`Failed to get metadata for topic ${topic}`, error);
      throw error;
    }
  }

  async createTopics(topics: string[]): Promise<void> {
    try {
      const admin = this.kafka.admin();
      await admin.connect();

      await admin.createTopics({
        topics: topics.map(topic => ({
          topic,
          numPartitions: 3,
          replicationFactor: 1,
        })),
      });

      await admin.disconnect();
      this.logger.log(`Created topics: ${topics.join(', ')}`);
    } catch (error) {
      this.logger.error('Failed to create topics', error);
      throw error;
    }
  }
}

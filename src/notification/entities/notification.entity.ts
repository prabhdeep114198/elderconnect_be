import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { AlertPriority } from '../../common/enums/user-role.enum';

export enum NotificationType {
  SMS = 'sms',
  PUSH = 'push',
  EMAIL = 'email',
  VOICE_CALL = 'voice_call',
  IN_APP = 'in_app',
}

export enum NotificationStatus {
  PENDING = 'pending',
  SENT = 'sent',
  DELIVERED = 'delivered',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum NotificationCategory {
  SOS_ALERT = 'sos_alert',
  MEDICATION_REMINDER = 'medication_reminder',
  APPOINTMENT_REMINDER = 'appointment_reminder',
  HEALTH_ALERT = 'health_alert',
  SYSTEM_NOTIFICATION = 'system_notification',
  FAMILY_UPDATE = 'family_update',
  DEVICE_STATUS = 'device_status',
}

@Entity('notifications')
@Index(['userId', 'createdAt'])
@Index(['status', 'priority'])
@Index(['type', 'status'])
@Index(['category', 'createdAt'])
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  userId: string;

  @Column({ type: 'uuid', nullable: true })
  recipientId: string; // Different from userId for caregiver notifications

  @Column({
    type: 'enum',
    enum: NotificationType,
  })
  type: NotificationType;

  @Column({
    type: 'enum',
    enum: NotificationCategory,
  })
  category: NotificationCategory;

  @Column({
    type: 'enum',
    enum: NotificationStatus,
    default: NotificationStatus.PENDING,
  })
  status: NotificationStatus;

  @Column({
    type: 'enum',
    enum: AlertPriority,
    default: AlertPriority.MEDIUM,
  })
  priority: AlertPriority;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'jsonb', nullable: true })
  data: Record<string, any>; // Additional data for the notification

  @Column({ type: 'varchar', length: 50, nullable: true })
  recipient: string; // Phone number, email, or device token

  @Column({ type: 'varchar', length: 255, nullable: true })
  externalId: string; // ID from external service (Twilio, FCM, etc.)

  @Column({ type: 'timestamp', nullable: true })
  scheduledAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  sentAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  deliveredAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  readAt: Date;

  @Column({ type: 'int', default: 0 })
  retryCount: number;

  @Column({ type: 'int', default: 3 })
  maxRetries: number;

  @Column({ type: 'text', nullable: true })
  errorMessage: string;

  @Column({ type: 'jsonb', nullable: true })
  deliveryAttempts: Record<string, any>[]; // Track all delivery attempts

  @Column({ type: 'boolean', default: false })
  isRead: boolean;

  @Column({ type: 'boolean', default: false })
  isArchived: boolean;

  @Column({ type: 'timestamp', nullable: true })
  expiresAt: Date;

  @CreateDateColumn()
  @Index()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  get isExpired(): boolean {
    return this.expiresAt ? new Date() > this.expiresAt : false;
  }

  get canRetry(): boolean {
    return this.status === NotificationStatus.FAILED && 
           this.retryCount < this.maxRetries && 
           !this.isExpired;
  }

  get deliveryTime(): number | null {
    if (!this.sentAt || !this.deliveredAt) return null;
    return this.deliveredAt.getTime() - this.sentAt.getTime();
  }

  markAsSent(externalId?: string): void {
    this.status = NotificationStatus.SENT;
    this.sentAt = new Date();
    if (externalId) {
      this.externalId = externalId;
    }
  }

  markAsDelivered(): void {
    this.status = NotificationStatus.DELIVERED;
    this.deliveredAt = new Date();
  }

  markAsFailed(errorMessage: string): void {
    this.status = NotificationStatus.FAILED;
    this.errorMessage = errorMessage;
    this.retryCount += 1;
  }

  markAsRead(): void {
    this.isRead = true;
    this.readAt = new Date();
  }

  addDeliveryAttempt(attempt: Record<string, any>): void {
    if (!this.deliveryAttempts) {
      this.deliveryAttempts = [];
    }
    this.deliveryAttempts.push({
      ...attempt,
      timestamp: new Date(),
      attemptNumber: this.retryCount + 1,
    });
  }

  setExpiration(hours: number): void {
    this.expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
  }
}

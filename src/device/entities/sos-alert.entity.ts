import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { AlertPriority } from '../../common/enums/user-role.enum';

export enum SOSStatus {
  ACTIVE = 'active',
  ACKNOWLEDGED = 'acknowledged',
  RESOLVED = 'resolved',
  FALSE_ALARM = 'false_alarm',
}

export enum SOSType {
  MANUAL = 'manual',
  FALL_DETECTION = 'fall_detection',
  HEART_RATE_ANOMALY = 'heart_rate_anomaly',
  MEDICATION_MISSED = 'medication_missed',
  INACTIVITY = 'inactivity',
  GEOFENCE_BREACH = 'geofence_breach',
  PANIC_BUTTON = 'panic_button',
}

@Entity('sos_alerts')
@Index(['userId', 'createdAt'])
@Index(['status', 'priority'])
@Index(['deviceId', 'createdAt'])
export class SOSAlert {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  userId: string;

  @Column({ type: 'uuid', nullable: true })
  deviceId: string;

  @Column({
    type: 'enum',
    enum: SOSType,
  })
  type: SOSType;

  @Column({
    type: 'enum',
    enum: SOSStatus,
    default: SOSStatus.ACTIVE,
  })
  status: SOSStatus;

  @Column({
    type: 'enum',
    enum: AlertPriority,
    default: AlertPriority.HIGH,
  })
  priority: AlertPriority;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'float', nullable: true })
  latitude: number;

  @Column({ type: 'float', nullable: true })
  longitude: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  address: string;

  @Column({ type: 'jsonb', nullable: true })
  contextData: Record<string, any>; // Additional data like vitals, device readings

  @Column({ type: 'jsonb', nullable: true })
  responseActions: Record<string, any>[]; // Actions taken in response

  @Column({ type: 'uuid', nullable: true })
  acknowledgedBy: string; // User ID who acknowledged

  @Column({ type: 'timestamp', nullable: true })
  acknowledgedAt: Date;

  @Column({ type: 'uuid', nullable: true })
  resolvedBy: string; // User ID who resolved

  @Column({ type: 'timestamp', nullable: true })
  resolvedAt: Date;

  @Column({ type: 'text', nullable: true })
  resolution: string;

  @Column({ type: 'jsonb', nullable: true })
  notificationsSent: Record<string, any>[]; // Track what notifications were sent

  @Column({ type: 'boolean', default: false })
  emergencyServicesContacted: boolean;

  @Column({ type: 'timestamp', nullable: true })
  emergencyContactedAt: Date;

  @Column({ type: 'varchar', length: 255, nullable: true })
  emergencyTicketNumber: string;

  @CreateDateColumn()
  @Index()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  get isActive(): boolean {
    return this.status === SOSStatus.ACTIVE;
  }

  get responseTime(): number | null {
    if (!this.acknowledgedAt) return null;
    return this.acknowledgedAt.getTime() - this.createdAt.getTime();
  }

  get resolutionTime(): number | null {
    if (!this.resolvedAt) return null;
    return this.resolvedAt.getTime() - this.createdAt.getTime();
  }

  get isCritical(): boolean {
    return this.priority === AlertPriority.CRITICAL || 
           this.type === SOSType.PANIC_BUTTON ||
           this.type === SOSType.FALL_DETECTION;
  }

  acknowledge(userId: string): void {
    this.status = SOSStatus.ACKNOWLEDGED;
    this.acknowledgedBy = userId;
    this.acknowledgedAt = new Date();
  }

  resolve(userId: string, resolution: string): void {
    this.status = SOSStatus.RESOLVED;
    this.resolvedBy = userId;
    this.resolvedAt = new Date();
    this.resolution = resolution;
  }

  markFalseAlarm(userId: string): void {
    this.status = SOSStatus.FALSE_ALARM;
    this.resolvedBy = userId;
    this.resolvedAt = new Date();
    this.resolution = 'Marked as false alarm';
  }

  addResponseAction(action: Record<string, any>): void {
    if (!this.responseActions) {
      this.responseActions = [];
    }
    this.responseActions.push({
      ...action,
      timestamp: new Date(),
    });
  }

  addNotificationSent(notification: Record<string, any>): void {
    if (!this.notificationsSent) {
      this.notificationsSent = [];
    }
    this.notificationsSent.push({
      ...notification,
      sentAt: new Date(),
    });
  }
}

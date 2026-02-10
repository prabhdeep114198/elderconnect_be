import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { MedicationLog } from './medication-log.entity';

export enum ReminderMethod {
  NOTIFICATION = 'notification',
  SMS = 'sms',
  CALL = 'call',
  CAREGIVER_ALERT = 'caregiver_alert',
}

export enum ReminderAction {
  TAKEN = 'taken',
  SNOOZED = 'snoozed',
  IGNORED = 'ignored',
  MISSED = 'missed',
  DISMISSED = 'dismissed',
}

@Entity('reminder_logs')
@Index(['medicationLogId', 'sentAt'])
export class ReminderLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  medicationLogId: string;

  @ManyToOne(() => MedicationLog, (log) => log.reminderLogs, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'medicationLogId' })
  medicationLog: MedicationLog;

  @Column({ type: 'timestamp' })
  sentAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  acknowledgedAt: Date;

  @Column({
    type: 'enum',
    enum: ReminderMethod,
    default: ReminderMethod.NOTIFICATION,
  })
  method: ReminderMethod;

  @Column({
    type: 'enum',
    enum: ReminderAction,
    nullable: true,
  })
  action: ReminderAction;

  @Column({ type: 'float', nullable: true })
  missProbabilityScore: number; // The score that triggered this specific reminder logic

  @Column({ type: 'boolean', default: false })
  isDynamic: boolean; // True if time was adjusted by AI

  @CreateDateColumn()
  createdAt: Date;
}

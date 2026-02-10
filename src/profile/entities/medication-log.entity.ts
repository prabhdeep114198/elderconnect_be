import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { Medication } from './medication.entity';
import { ReminderLog } from './reminder-log.entity';

export enum MedicationLogStatus {
  TAKEN = 'taken',
  MISSED = 'missed',
  SKIPPED = 'skipped',
  DELAYED = 'delayed',
}

@Entity('medication_logs')
@Index(['medicationId', 'scheduledTime'])
@Index(['status', 'scheduledTime'])
export class MedicationLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  medicationId: string;

  @ManyToOne(() => Medication, medication => medication.logs, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'medicationId' })
  medication: Medication;

  @Column({ type: 'timestamp' })
  scheduledTime: Date;

  @Column({ type: 'timestamp', nullable: true })
  actualTime: Date;

  @Column({
    type: 'enum',
    enum: MedicationLogStatus,
  })
  status: MedicationLogStatus;

  @Column({ type: 'varchar', length: 100, nullable: true })
  dosageTaken: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  location: string; // Where the medication was taken

  @Column({ type: 'jsonb', nullable: true })
  sideEffectsReported: string[];

  @Column({ type: 'int', nullable: true, default: null })
  painLevelBefore: number; // 1-10 scale

  @Column({ type: 'int', nullable: true, default: null })
  painLevelAfter: number; // 1-10 scale

  @Column({ type: 'varchar', length: 50, nullable: true })
  moodBefore: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  moodAfter: string;

  @CreateDateColumn()
  createdAt: Date;

  @OneToMany(() => ReminderLog, (reminder) => reminder.medicationLog)
  reminderLogs: ReminderLog[];

  get isOnTime(): boolean {
    if (!this.actualTime || this.status !== MedicationLogStatus.TAKEN) {
      return false;
    }

    const scheduledTime = new Date(this.scheduledTime);
    const actualTime = new Date(this.actualTime);
    const diffMinutes = Math.abs(actualTime.getTime() - scheduledTime.getTime()) / (1000 * 60);

    return diffMinutes <= 30; // Consider on-time if within 30 minutes
  }

  get delayMinutes(): number | null {
    if (!this.actualTime || this.status !== MedicationLogStatus.TAKEN) {
      return null;
    }

    const scheduledTime = new Date(this.scheduledTime);
    const actualTime = new Date(this.actualTime);
    const diffMinutes = (actualTime.getTime() - scheduledTime.getTime()) / (1000 * 60);

    return Math.round(diffMinutes);
  }
}

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  OneToMany,
} from 'typeorm';
import { UserProfile } from './user-profile.entity';
import { MedicationLog } from './medication-log.entity';

@Entity('medications')
@Index(['userProfileId', 'isActive'])
@Index(['name', 'userProfileId'])
export class Medication {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userProfileId: string;

  @ManyToOne(() => UserProfile, profile => profile.medications, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userProfileId' })
  userProfile: UserProfile;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  genericName: string;

  @Column({ type: 'varchar', length: 100 })
  dosage: string;

  @Column({ type: 'varchar', length: 100 })
  frequency: string;

  @Column({ type: 'varchar', length: 50 })
  unit: string; // mg, ml, tablets, etc.

  @Column({ type: 'text', nullable: true })
  instructions: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  prescribedBy: string;

  @Column({ type: 'date' })
  startDate: Date;

  @Column({ type: 'date', nullable: true })
  endDate: Date;

  @Column({ type: 'varchar', length: 50, nullable: true })
  condition: string; // What condition this medication treats

  @Column({ type: 'text', array: true, default: [] })
  sideEffects: string[];

  @Column({ type: 'text', array: true, default: [] })
  interactions: string[];

  @Column({ type: 'jsonb', nullable: true })
  schedule: Record<string, any>; // Time-based schedule

  @Column({ type: 'boolean', default: true })
  reminderEnabled: boolean;

  @Column({ type: 'int', default: 30 })
  reminderMinutesBefore: number;

  @Column({ type: 'int', nullable: true })
  refillReminder: number; // Days before running out

  @Column({ type: 'int', nullable: true })
  currentStock: number;

  @Column({ type: 'varchar', length: 50, nullable: true })
  color: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  shape: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @OneToMany(() => MedicationLog, log => log.medication)
  logs: MedicationLog[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  get isCurrentlyActive(): boolean {
    const now = new Date();
    const start = new Date(this.startDate);
    const end = this.endDate ? new Date(this.endDate) : null;
    
    return this.isActive && 
           now >= start && 
           (!end || now <= end);
  }

  get needsRefill(): boolean {
    if (!this.currentStock || !this.refillReminder) return false;
    return this.currentStock <= this.refillReminder;
  }

  get daysRemaining(): number | null {
    if (!this.endDate) return null;
    const now = new Date();
    const end = new Date(this.endDate);
    const diffTime = end.getTime() - now.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }
}

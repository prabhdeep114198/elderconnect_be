import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';
import { DeviceType } from '../../common/enums/user-role.enum';

@Entity('devices')
@Index(['deviceId'], { unique: true })
@Index(['userId', 'isActive'])
export class Device {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  deviceId: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({
    type: 'enum',
    enum: DeviceType,
  })
  type: DeviceType;

  @Column({ type: 'varchar', length: 100, nullable: true })
  manufacturer: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  model: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  firmwareVersion: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'boolean', default: false })
  isOnline: boolean;

  @Column({ type: 'timestamp', nullable: true })
  lastSeenAt: Date;

  @Column({ type: 'jsonb', nullable: true })
  configuration: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  capabilities: string[];

  @Column({ type: 'varchar', length: 255, nullable: true })
  certificateFingerprint: string;

  @Column({ type: 'text', nullable: true })
  publicKey: string;

  @Column({ type: 'inet', nullable: true })
  lastKnownIp: string;

  @Column({ type: 'float', nullable: true })
  batteryLevel: number;

  @Column({ type: 'varchar', length: 50, nullable: true })
  location: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  updateLastSeen(): void {
    this.lastSeenAt = new Date();
    this.isOnline = true;
  }

  setOffline(): void {
    this.isOnline = false;
  }

  updateBatteryLevel(level: number): void {
    this.batteryLevel = Math.max(0, Math.min(100, level));
  }
}

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

@Entity('telemetry_data')
@Index(['deviceId', 'timestamp'])
@Index(['userId', 'timestamp'])
@Index(['metricType', 'timestamp'])
export class TelemetryData {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  deviceId: string;

  @Column({ type: 'uuid' })
  @Index()
  userId: string;

  @Column({ type: 'varchar', length: 100 })
  metricType: string; // heart_rate, blood_pressure, steps, temperature, etc.

  @Column({ type: 'jsonb' })
  value: Record<string, any>; // Flexible structure for different metric types

  @Column({ type: 'varchar', length: 50, nullable: true })
  unit: string; // bpm, mmHg, steps, celsius, etc.

  @Column({ type: 'timestamp' })
  @Index()
  timestamp: Date;

  @Column({ type: 'float', nullable: true })
  latitude: number;

  @Column({ type: 'float', nullable: true })
  longitude: number;

  @Column({ type: 'varchar', length: 100, nullable: true })
  location: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>; // Additional context data

  @Column({ type: 'varchar', length: 50, nullable: true })
  quality: string; // good, fair, poor - data quality indicator

  @Column({ type: 'boolean', default: false })
  isProcessed: boolean;

  @Column({ type: 'boolean', default: false })
  isAnomalous: boolean;

  @Column({ type: 'float', nullable: true })
  confidenceScore: number; // 0-1 confidence in the reading

  @CreateDateColumn()
  createdAt: Date;

  get isRecent(): boolean {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    return this.timestamp >= fiveMinutesAgo;
  }

  get isValidReading(): boolean {
    return this.quality !== 'poor' && this.confidenceScore > 0.7;
  }
}

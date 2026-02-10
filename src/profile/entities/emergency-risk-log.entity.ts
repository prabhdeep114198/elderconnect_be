import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { UserProfile } from './user-profile.entity';

export enum EmergencyRiskLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

@Entity('emergency_risk_logs')
export class EmergencyRiskLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userProfileId: string;

  @Column({ type: 'float' })
  riskScore: number; // 0.0 to 1.0

  @Column({
    type: 'enum',
    enum: EmergencyRiskLevel,
    default: EmergencyRiskLevel.LOW,
  })
  riskLevel: EmergencyRiskLevel;

  @Column({ type: 'jsonb', nullable: true })
  factors: {
    anomalyScore: number;
    forecastProbability: number;
    adherencePenalty: number;
    vitalSpikes?: string[];
  };

  @Column({ type: 'boolean', default: false })
  alertSent: boolean;

  @ManyToOne(() => UserProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userProfileId' })
  userProfile: UserProfile;

  @CreateDateColumn()
  createdAt: Date;
}

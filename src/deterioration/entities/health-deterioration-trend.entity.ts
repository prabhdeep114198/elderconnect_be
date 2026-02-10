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
import { UserProfile } from '../../profile/entities/user-profile.entity';

@Entity('health_deterioration_trends')
@Index(['userProfileId', 'assessmentDate'])
export class HealthDeteriorationTrend {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userProfileId: string;

  @Column({ type: 'date' })
  assessmentDate: Date;

  @Column({ type: 'float' })
  deteriorationScore: number; // 0 (Healthy) to 100 (Critical Decline)

  @Column({ type: 'jsonb' })
  aggregates: {
    physical: {
      steps7dAvg: number;
      steps30dAvg: number;
      stepsDelta: number; // % change 7d vs 30d
    };
    vitals: {
      hr7dAvg: number;
      hrBaseline: number;
      hrDelta: number;
      spo27dAvg: number;
      spo2Baseline: number;
    };
    adherence: {
      medMissRate7d: number;
      medMissRate30d: number;
      adherenceTrend: 'stable' | 'declining' | 'improving';
    };
    emergency: {
      risk7dAvg: number;
      risk30dAvg: number;
      riskSlope: number; // Rate of change
    };
  };

  @Column({ type: 'text', nullable: true })
  trendSummary: string;

  @ManyToOne(() => UserProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userProfileId' })
  userProfile: UserProfile;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

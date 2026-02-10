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

@Entity('personalized_health_scores')
@Index(['userProfileId', 'date'])
export class PersonalizedHealthScore {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userProfileId: string;

  @Column({ type: 'date' })
  date: Date;

  @Column({ type: 'integer' })
  score: number; // 0-100

  @Column({ type: 'varchar', length: 50 })
  statusLabel: string; // Excellent, Stable, Needs Attention

  @Column({ type: 'jsonb' })
  dimensions: {
    vitalStability: number;
    mobility: number;
    adherence: number;
    lifestyle: number;
    riskExposure: number;
  };

  @Column({ type: 'jsonb' })
  explanations: string[]; // Human-readable reasons for the score

  @ManyToOne(() => UserProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userProfileId' })
  userProfile: UserProfile;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

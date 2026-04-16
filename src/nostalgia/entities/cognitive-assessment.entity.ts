import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';

export enum AssessmentType {
  MOOD = 'MOOD',
  COGNITIVE = 'COGNITIVE',
}

@Entity('cognitive_assessments')
export class CognitiveAssessment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({
    type: 'enum',
    enum: AssessmentType,
    default: AssessmentType.MOOD,
  })
  type: AssessmentType;

  @Column({ nullable: true })
  source: string; // 'NOSTALGIA' | 'VOICE'

  @Column('float', { nullable: true })
  score: number;

  @Column({ nullable: true })
  label: string; // 'Positive', 'Warning', etc.

  @Column('simple-json', { nullable: true })
  metadata: any; // { markers: [], sentimentScores: {} }

  @Column('text', { nullable: true })
  analysis: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

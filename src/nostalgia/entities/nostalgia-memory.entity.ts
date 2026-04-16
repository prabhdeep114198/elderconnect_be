import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';

@Entity('nostalgia_memories')
export class NostalgiaMemory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column('text')
  prompt: string;

  @Column('text')
  transcript: string;

  @Column({ name: 'audio_url', nullable: true })
  audioUrl: string;

  @Column('simple-json', { nullable: true })
  themes: string[];

  @Column('float', { name: 'mood_score', nullable: true })
  moodScore: number;

  @Column({ name: 'mood_label', nullable: true })
  moodLabel: string;

  @CreateDateColumn({ name: 'recorded_at' })
  recordedAt: Date;
}

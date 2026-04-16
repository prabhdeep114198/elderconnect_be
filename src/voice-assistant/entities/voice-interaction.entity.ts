import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';

@Entity('voice_interactions')
export class VoiceInteraction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column('text')
  transcript: string;

  @Column({ nullable: true })
  intent: string;

  @Column({ default: false })
  isConversational: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { CallStatus, CallType } from './videocall.enums';

@Entity('video_calls')
@Index(['caller_id', 'created_at'])
@Index(['callee_id', 'created_at'])
@Index(['room_id', 'status'])
export class VideoCallEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  caller_id: string;

  @Column({ type: 'varchar', length: 255 })
  callee_id: string;

  /** Unique room identifier – used as the WebRTC room key */
  @Column({ type: 'varchar', length: 255, unique: true })
  room_id: string;

  @Column({ type: 'enum', enum: CallStatus, default: CallStatus.PENDING })
  status: CallStatus;

  @Column({ type: 'enum', enum: CallType, default: CallType.VIDEO })
  call_type: CallType;

  @Column({ type: 'timestamp', nullable: true })
  accepted_at: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  ended_at: Date | null;

  @Column({ type: 'integer', nullable: true, default: 0 })
  duration_seconds: number;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
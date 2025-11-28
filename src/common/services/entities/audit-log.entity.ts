import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';
import { AuditAction } from '../../enums/user-role.enum';

@Entity('audit_logs')
@Index(['userId', 'timestamp'])
@Index(['action', 'timestamp'])
@Index(['resource', 'timestamp'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  @Index()
  userId: string;

  @Column({
    type: 'enum',
    enum: AuditAction,
  })
  action: AuditAction;

  @Column({ type: 'varchar', length: 255 })
  resource: string;

  @Column({ type: 'jsonb', nullable: true })
  details: Record<string, any>;

  @Column({ type: 'inet', nullable: true })
  ipAddress: string;

  @Column({ type: 'text', nullable: true })
  userAgent: string;

  @CreateDateColumn()
  @Index()
  timestamp: Date;

  @Column({ type: 'varchar', length: 100, nullable: true })
  sessionId: string;

  @Column({ type: 'boolean', default: false })
  isSuccessful: boolean;

  @Column({ type: 'text', nullable: true })
  errorMessage: string;
}

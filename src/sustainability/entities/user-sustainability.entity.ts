import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('user_sustainability')
@Index(['userId', 'year'], { unique: true })
export class UserSustainability {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  userId: string;

  @Column({ type: 'integer' })
  year: number;

  @Column({ type: 'integer', default: 0 })
  reportsGenerated: number;

  @Column({ type: 'integer', default: 0 })
  telemedicineSessions: number;

  @Column({ type: 'integer', default: 0 })
  digitalReportsShared: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

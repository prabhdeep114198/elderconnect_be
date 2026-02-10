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
import { UserProfile } from './user-profile.entity';

@Entity('daily_health_metrics')
@Index(['userProfileId', 'date'], { unique: true })
export class DailyHealthMetric {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'uuid' })
    userProfileId: string;

    @Column({ type: 'date' })
    date: Date;

    @Column({ type: 'integer', default: 0 })
    steps: number;

    @Column({ type: 'integer', nullable: true })
    heartRate: number; // Latest or Average BPM

    @Column({ type: 'float', nullable: true })
    sleepHours: number;

    @Column({ type: 'integer', default: 0 })
    waterIntake: number; // in cups

    @Column({ type: 'integer', nullable: true })
    oxygenSaturation: number; // SpO2 percentage

    @Column({ type: 'jsonb', nullable: true })
    additionalMetrics: Record<string, any>;

    @ManyToOne(() => UserProfile, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'userProfileId' })
    userProfile: UserProfile;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}

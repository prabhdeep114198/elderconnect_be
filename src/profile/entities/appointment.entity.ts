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

export enum AppointmentStatus {
    SCHEDULED = 'scheduled',
    COMPLETED = 'completed',
    CANCELLED = 'cancelled',
    MISSED = 'missed',
}

@Entity('appointments')
@Index(['userProfileId', 'scheduledAt'])
export class Appointment {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'uuid' })
    userProfileId: string;

    @Column({ type: 'varchar', length: 255 })
    title: string;

    @Column({ type: 'text', nullable: true })
    description: string;

    @Column({ type: 'varchar', length: 255, nullable: true })
    doctorName: string;

    @Column({ type: 'varchar', length: 255, nullable: true })
    location: string;

    @Column({ type: 'varchar', length: 255, nullable: true })
    clinicName: string;

    @Column({ type: 'timestamp' })
    scheduledAt: Date;

    @Column({ type: 'integer', default: 30 })
    durationMinutes: number;

    @Column({
        type: 'enum',
        enum: AppointmentStatus,
        default: AppointmentStatus.SCHEDULED,
    })
    status: AppointmentStatus;

    @Column({ type: 'text', nullable: true })
    notes: string;

    @Column({ type: 'boolean', default: true })
    reminderEnabled: boolean;

    @Column({ type: 'integer', default: 60 })
    reminderMinutesBefore: number;

    @ManyToOne(() => UserProfile, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'userProfileId' })
    userProfile: UserProfile;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}

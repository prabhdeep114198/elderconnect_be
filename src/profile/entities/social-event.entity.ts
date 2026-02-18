import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    ManyToOne,
    ManyToMany,
    JoinTable,
    JoinColumn,
    Index,
} from 'typeorm';
import { UserProfile } from './user-profile.entity';

@Entity('social_events')
@Index(['scheduledAt'])
export class SocialEvent {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'uuid' })
    hostId: string;

    @Column({ type: 'varchar', length: 255 })
    title: string;

    @Column({ type: 'text', nullable: true })
    description: string;

    @Column({ type: 'varchar', length: 255, nullable: true })
    location: string;

    @Column({ type: 'timestamp' })
    scheduledAt: Date;

    @Column({ type: 'varchar', length: 100, default: 'social' })
    category: string;

    @ManyToOne(() => UserProfile, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'hostId' })
    host: UserProfile;

    @ManyToMany(() => UserProfile)
    @JoinTable({
        name: 'social_event_attendees',
        joinColumn: { name: 'eventId', referencedColumnName: 'id' },
        inverseJoinColumn: { name: 'userId', referencedColumnName: 'id' }
    })
    attendees: UserProfile[];

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}

import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, ManyToOne } from 'typeorm';

export enum InteractionType {
    MUSIC_PLAY = 'music_play',
    EVENT_VIEW = 'event_view',
    EVENT_JOIN = 'event_join',
    FEATURE_USE = 'feature_use',
    MOOD_LOG = 'mood_log',
    CONTENT_VIEW = 'content_view',
    CONTENT_DISMISS = 'content_dismiss',
    ACTIVITY_START = 'activity_start',
    ACTIVITY_COMPLETE = 'activity_complete',
    APP_SESSION = 'app_session',
}

@Entity('user_interactions')
@Index(['userId', 'type'])
@Index(['userId', 'createdAt'])
export class UserInteraction {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'uuid' })
    userId: string;

    @Column({
        type: 'enum',
        enum: InteractionType,
    })
    type: InteractionType;

    @Column({ type: 'varchar', length: 255, nullable: true })
    targetId: string; // ID of the music, event, or feature

    @Column({ type: 'jsonb', nullable: true })
    metadata: Record<string, any>; // Extra info (e.g., genre, duration, mood value)

    @CreateDateColumn()
    createdAt: Date;
}

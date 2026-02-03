import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum StreakType {
    MEDICATION = 'medication',
    STEPS = 'steps',
    HEALTH = 'health',
}

@Entity('user_streaks')
@Index(['userId', 'type'], { unique: true })
export class UserStreak {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'uuid' })
    userId: string;

    @Column({
        type: 'enum',
        enum: StreakType,
    })
    type: StreakType;

    @Column({ type: 'integer', default: 0 })
    count: number;

    @Column({ type: 'date', nullable: true })
    lastActiveDate: Date;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}

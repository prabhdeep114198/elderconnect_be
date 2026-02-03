import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('user_achievements')
@Index(['userId', 'achievementId'], { unique: true })
export class UserAchievement {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'uuid' })
    userId: string;

    @Column()
    achievementId: string; // Internal ID for the achievement

    @Column()
    name: string;

    @Column()
    icon: string;

    @Column()
    color: string;

    @CreateDateColumn()
    earnedAt: Date;
}

import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    Index,
    UpdateDateColumn,
} from 'typeorm';

export enum RiskTrend {
    INCREASING = 'increasing',
    STABLE = 'stable',
    DECREASING = 'decreasing',
}

@Entity('fall_risk_assessments')
@Index(['userId', 'createdAt'])
export class FallRiskAssessment {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'uuid' })
    userId: string;

    @Column({ type: 'float' })
    currentRiskScore: number;

    @Column({ type: 'float' })
    forecast7d: number;

    @Column({ type: 'float' })
    forecast30d: number;

    @Column({ type: 'float' })
    forecast90d: number;

    @Column({
        type: 'enum',
        enum: RiskTrend,
        default: RiskTrend.STABLE,
    })
    trend: RiskTrend;

    @Column({ type: 'jsonb', nullable: true })
    confidenceInterval: { lower: number; upper: number };

    @Column({ type: 'jsonb', nullable: true })
    recommendations: any[];

    @Column({ type: 'boolean', default: false })
    isSpike: boolean;

    @Column({ type: 'timestamp' })
    calculationDate: Date;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}

import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    ManyToOne,
    JoinColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';

export enum SubscriptionStatus {
    PENDING = 'pending',
    ACTIVE = 'active',
    CANCELLED = 'cancelled',
    EXPIRED = 'expired',
    FAILED = 'failed',
}

@Entity('subscriptions')
export class Subscription {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @ManyToOne(() => User)
    @JoinColumn({ name: 'userId' })
    user!: User;

    @Column()
    userId!: string;

    @Column({ type: 'varchar', unique: true })
    razorpayOrderId!: string;

    @Column({ type: 'varchar', nullable: true })
    razorpayPaymentId?: string;

    @Column({ type: 'varchar', nullable: true })
    razorpaySignature?: string;

    @Column({
        type: 'enum',
        enum: SubscriptionStatus,
        default: SubscriptionStatus.PENDING,
    })
    status!: SubscriptionStatus;

    @Column({ type: 'decimal', precision: 10, scale: 2 })
    amount!: number;

    @Column({ type: 'varchar', default: 'INR' })
    currency!: string;

    @Column({ type: 'timestamp', nullable: true })
    startDate?: Date;

    @Column({ type: 'timestamp', nullable: true })
    endDate?: Date;

    @CreateDateColumn()
    createdAt!: Date;

    @UpdateDateColumn()
    updatedAt!: Date;
}

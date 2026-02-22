import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    Index,
    UpdateDateColumn,
} from 'typeorm';

@Entity('sensor_data')
@Index(['userId', 'timestamp'])
@Index(['sensorType', 'userId'])
export class SensorData {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'uuid' })
    userId: string;

    @Column({ type: 'varchar', length: 50 })
    sensorType: string; // motion, pressure_mat, gait_accelerometer

    @Column({ type: 'jsonb' })
    rawData: Record<string, any>;

    @Column({ type: 'jsonb', nullable: true })
    processedFeatures: Record<string, any>;

    @Column({ type: 'timestamp' })
    timestamp: Date;

    @Column({ type: 'boolean', default: false })
    isAnomaly: boolean;

    @Column({ type: 'varchar', length: 100, nullable: true })
    anomalyReason: string;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}

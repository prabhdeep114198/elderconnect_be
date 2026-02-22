import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SensorData } from '../entities/sensor-data.entity';
import { FallRiskService } from '../../deterioration/services/fall-risk.service';

@Injectable()
export class SensorDataService {
    private readonly logger = new Logger(SensorDataService.name);

    constructor(
        @InjectRepository(SensorData, 'vitals')
        private readonly sensorRepo: Repository<SensorData>,
        private readonly fallRiskService: FallRiskService,
    ) { }

    /**
     * Primary ingestion entry point for smart home sensors
     */
    async ingestSensorData(userId: string, payload: any) {
        this.logger.log(`Ingesting sensor data for user ${userId}: ${payload.sensorType}`);

        // 1. Validation & Noise Filtering
        if (!this.isValidPayload(payload)) {
            this.logger.warn(`Invalid payload received for ${userId}`);
            return;
        }

        // 2. Feature Extraction (Simple for now, could be signal processing)
        const processedFeatures = this.extractFeatures(payload);

        // 3. Save to Time-Series optimized structure
        const sensorEntry = this.sensorRepo.create({
            userId,
            sensorType: payload.sensorType,
            rawData: payload.data,
            processedFeatures,
            timestamp: payload.timestamp ? new Date(payload.timestamp) : new Date(),
            isAnomaly: this.detectAnomaly(payload),
        });

        await this.sensorRepo.save(sensorEntry);

        // 4. Trigger Dynamic Risk Recalculation (Event-Driven)
        if (this.shouldTriggerRecalculation(payload)) {
            await this.fallRiskService.recalculateRisk(userId);
        }

        return sensorEntry;
    }

    private isValidPayload(payload: any): boolean {
        return !!(payload.sensorType && payload.data);
    }

    private extractFeatures(payload: any) {
        // Logic to convert raw signals (accelerometer/pressure) into counts/variability
        if (payload.sensorType === 'pressure_mat') {
            return {
                imbalance_index: Math.abs((payload.data.left || 0) - (payload.data.right || 0)),
                step_force_avg: (payload.data.left + payload.data.right) / 2
            };
        }
        return {};
    }

    private detectAnomaly(payload: any): boolean {
        // Spike detection or out-of-bounds reading
        if (payload.sensorType === 'gait' && payload.data.variability > 0.5) return true;
        return false;
    }

    private shouldTriggerRecalculation(payload: any): boolean {
        // Don't recalculate on every minor motion, but definitely on pressure mat or gait anomalies
        const criticalSensors = ['pressure_mat', 'gait'];
        return criticalSensors.includes(payload.sensorType) || payload.isAnomaly;
    }
}

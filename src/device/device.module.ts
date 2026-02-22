import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeviceController } from './device.controller';
import { DeviceService } from './device.service';
import { TelemetryData } from './entities/telemetry.entity';
import { Vitals } from './entities/vitals.entity';
import { SOSAlert } from './entities/sos-alert.entity';
import { SensorData } from './entities/sensor-data.entity';
import { KafkaService } from './services/kafka.service';
import { SensorDataService } from './services/sensor-data.service';
import { DeteriorationModule } from '../deterioration/deterioration.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([TelemetryData, Vitals, SOSAlert, SensorData], 'vitals'),
    forwardRef(() => DeteriorationModule),
  ],
  controllers: [DeviceController],
  providers: [DeviceService, KafkaService, SensorDataService],
  exports: [DeviceService, KafkaService, SensorDataService],
})
export class DeviceModule { }

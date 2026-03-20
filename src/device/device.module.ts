import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeviceController } from './device.controller';
import { PublicDeviceController } from './public-device.controller';
import { DeviceService } from './device.service';
import { TelemetryData } from './entities/telemetry.entity';
import { Vitals } from './entities/vitals.entity';
import { SOSAlert } from './entities/sos-alert.entity';
import { KafkaService } from './services/kafka.service';
import { AuditLogService } from '../common/services/audit-log.service';
import { AuditLog } from '../common/services/entities/audit-log.entity';
import { DeviceGateway } from './device.gateway';

@Module({
  imports: [
    TypeOrmModule.forFeature([TelemetryData, Vitals, SOSAlert], 'vitals'),
    TypeOrmModule.forFeature([AuditLog], 'audit'),
  ],
  controllers: [DeviceController, PublicDeviceController],
  providers: [DeviceService, KafkaService, AuditLogService, DeviceGateway],
  exports: [DeviceService, KafkaService, DeviceGateway],
})
export class DeviceModule {}

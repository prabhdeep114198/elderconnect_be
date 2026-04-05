import { Module, forwardRef } from '@nestjs/common';
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
import { NotificationModule } from '../notification/notification.module';
import { UserProfile } from '../profile/entities/user-profile.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([TelemetryData, Vitals, SOSAlert], 'vitals'),
    TypeOrmModule.forFeature([AuditLog], 'audit'),
    TypeOrmModule.forFeature([UserProfile], 'profile'),
    forwardRef(() => NotificationModule),
  ],
  controllers: [DeviceController, PublicDeviceController],
  providers: [DeviceService, KafkaService, AuditLogService, DeviceGateway],
  exports: [DeviceService, KafkaService, DeviceGateway],
})
export class DeviceModule {}

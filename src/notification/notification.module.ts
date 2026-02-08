import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { Notification } from './entities/notification.entity';
import { NotificationTemplate } from './entities/notification-template.entity';
import { TwilioService } from './services/twilio.service';
import { FCMService } from './services/fcm.service';
import { KafkaService } from '../device/services/kafka.service';
import { DeviceModule } from '../device/device.module';
import { AuditLogModule } from '../common/services/audit-log.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, NotificationTemplate], 'audit'),
    AuditLogModule,
    DeviceModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [NotificationController],
  providers: [
    NotificationService,
    TwilioService,
    FCMService,
  ],
  exports: [NotificationService, TwilioService, FCMService],
})
export class NotificationModule { }

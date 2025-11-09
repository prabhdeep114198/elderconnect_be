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
import { AuditLogService } from '../common/services/audit-log.service';
import { AuditLog } from '../common/entities/audit-log.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, NotificationTemplate], 'audit'),
    TypeOrmModule.forFeature([AuditLog], 'audit'),
    ScheduleModule.forRoot(),
  ],
  controllers: [NotificationController],
  providers: [
    NotificationService,
    TwilioService,
    FCMService,
    KafkaService,
    AuditLogService,
  ],
  exports: [NotificationService, TwilioService, FCMService],
})
export class NotificationModule {}

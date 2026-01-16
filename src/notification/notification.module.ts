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
import { AuditLogModule } from '../common/services/audit-log.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, NotificationTemplate], 'audit'),
    AuditLogModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [NotificationController],
  providers: [
    NotificationService,
    TwilioService,
    FCMService,
    KafkaService,
  ],
  exports: [NotificationService, TwilioService, FCMService],
})
export class NotificationModule { }

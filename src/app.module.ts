import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { CacheModule } from '@nestjs/cache-manager';
import { APP_GUARD, APP_INTERCEPTOR, APP_FILTER } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { PrivacyModule } from "./privacy/privacy.module";
import { PrivacyPolicy } from "./privacy/entities/privacy-policy.entity";
import { VideoCallModule } from './videocall/videocall.module';
import { VideoCallEntity } from './videocall/videocall.entity';


// Configuration
import {
  appConfig,
  jwtConfig,
  awsConfig,
  twilioConfig,
  firebaseConfig,
  throttleConfig,
  fileUploadConfig,
  n8nConfig
} from './config/app.config';
import { databaseConfig } from './config/database.config';
import { validateEnvironment } from './config/env.validation';

// Modules
import { AuthModule } from './auth/auth.module';
import { ProfileModule } from './profile/profile.module';
import { DeviceModule } from './device/device.module';
import { MediaModule } from './media/media.module';
import { NotificationModule } from './notification/notification.module';
import { AuditLogModule } from './common/services/audit-log.module';
import { ChatModule } from './chat/chat.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { FirebaseAdminModule } from './common/services/firebase-admin.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { VoiceModule } from './voice/voice.module';
import { GraphModule } from './graph/graph.module';
import { CommonCacheModule } from './common/services/cache.module';
import { PersonalizationModule } from './personalization/personalization.module';
import { VoiceAssistantModule } from './voice-assistant/voice-assistant.module';

// Common interceptors
import { AuditLogInterceptor } from './common/interceptors/audit-log.interceptor';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

// Entities for different databases
import { User } from './auth/entities/user.entity';
import { Device } from './auth/entities/device.entity';
import { UserProfile } from './profile/entities/user-profile.entity';
import { Medication } from './profile/entities/medication.entity';
import { MedicationLog } from './profile/entities/medication-log.entity';
import { DailyHealthMetric } from './profile/entities/daily-health-metric.entity';
import { Appointment } from './profile/entities/appointment.entity';
import { SocialEvent } from './profile/entities/social-event.entity';
import { ReminderLog } from './profile/entities/reminder-log.entity';
import { EmergencyRiskLog } from './profile/entities/emergency-risk-log.entity';
import { TelemetryData } from './device/entities/telemetry.entity';
import { Vitals } from './device/entities/vitals.entity';
import { SOSAlert } from './device/entities/sos-alert.entity';
import { MediaFile } from './media/entities/media-file.entity';
import { Notification } from './notification/entities/notification.entity';
import { NotificationTemplate } from './notification/entities/notification-template.entity';
import { AuditLog } from './common/services/entities/audit-log.entity';
import { Subscription } from './subscriptions/entities/subscription.entity';
import { UserInteraction } from './personalization/entities/user-interaction.entity';

@Module({
  imports: [
    // Configuration with validation
    ConfigModule.forRoot({
      isGlobal: true,
      load: [
        appConfig,
        databaseConfig,
        jwtConfig,
        awsConfig,
        twilioConfig,
        firebaseConfig,
        throttleConfig,
        fileUploadConfig,
        n8nConfig,

      ],
      envFilePath: ['.env.local', '.env'],
      validate: validateEnvironment,
    }),
    PrivacyModule,

    // Rate limiting
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1, limit: 10 },
      { name: 'medium', ttl: 60, limit: 100 },
      { name: 'long', ttl: 900, limit: 1000 },
    ]),

    // Scheduling
    ScheduleModule.forRoot(),

    // Redis Cache
    CacheModule.registerAsync({
      isGlobal: true,
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        store: require('cache-manager-ioredis-yet'),
        host: configService.get('REDIS_HOST'),
        port: configService.get('REDIS_PORT'),
        password: configService.get('REDIS_PASSWORD') || undefined,
        ttl: 300, // Default TTL: 5 minutes
      }),
      inject: [ConfigService],
    }),

    // Database connections
    // Auth Database
    TypeOrmModule.forRootAsync({
      name: 'auth',
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('database.auth.host'),
        port: configService.get('database.auth.port'),
        username: configService.get('database.auth.username'),
        password: configService.get('database.auth.password'),
        database: configService.get('database.auth.database'),
        entities: [User, Device, Subscription],
        synchronize: true, // Enabled to auto-create missing columns like 'avatar'
        logging: configService.get('app.environment') === 'development',
        // Use the database config's SSL setting so env flags like requiring SSL are honored
        ssl: configService.get('database.auth.ssl'),
        extra: { max: 20, idleTimeoutMillis: 30000, connectionTimeoutMillis: 2000 },
      }),
      inject: [ConfigService],
    }),

    // Profile Database
    TypeOrmModule.forRootAsync({
      name: 'profile',
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('database.profile.host'),
        port: configService.get('database.profile.port'),
        username: configService.get('database.profile.username'),
        password: configService.get('database.profile.password'),
        database: configService.get('database.profile.database'),
        entities: [
          UserProfile,
          Medication,
          MedicationLog,
          DailyHealthMetric,
          Appointment,
          SocialEvent,
          ReminderLog,
          EmergencyRiskLog,
          VideoCallEntity,
          UserInteraction,
        ],
        synchronize: true, // temporary, will auto-create tables
        logging: configService.get('app.environment') === 'development',
        ssl: configService.get('database.profile.ssl'),
      }),
      inject: [ConfigService],
    }),

    // Vitals Database
    TypeOrmModule.forRootAsync({
      name: 'vitals',
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('database.vitals.host'),
        port: configService.get('database.vitals.port'),
        username: configService.get('database.vitals.username'),
        password: configService.get('database.vitals.password'),
        database: configService.get('database.vitals.database'),
        entities: [TelemetryData, Vitals, SOSAlert],
        synchronize: false, // Set to false to prevent data loss and use migrations instead
        logging: configService.get('app.environment') === 'development',
        ssl: configService.get('database.vitals.ssl'),
        extra: { max: 30, idleTimeoutMillis: 30000, connectionTimeoutMillis: 2000 },
      }),
      inject: [ConfigService],
    }),

    // Media Database
    TypeOrmModule.forRootAsync({
      name: 'media',
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('database.media.host'),
        port: configService.get('database.media.port'),
        username: configService.get('database.media.username'),
        password: configService.get('database.media.password'),
        database: configService.get('database.media.database'),
        entities: [MediaFile],
        synchronize: false, // Set to false to prevent data loss and use migrations instead
        logging: configService.get('app.environment') === 'development',
        ssl: configService.get('database.media.ssl'),
        extra: { max: 15, idleTimeoutMillis: 30000, connectionTimeoutMillis: 2000 },
      }),
      inject: [ConfigService],
    }),

    // Audit Database
    TypeOrmModule.forRootAsync({
      name: 'audit',
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('database.audit.host'),
        port: configService.get('database.audit.port'),
        username: configService.get('database.audit.username'),
        password: configService.get('database.audit.password'),
        database: configService.get('database.audit.database'),
        entities: [AuditLog, Notification, NotificationTemplate, PrivacyPolicy],
        synchronize: false, // Set to false to prevent data loss and use migrations instead
        logging: configService.get('app.environment') === 'development',
        ssl: configService.get('database.audit.ssl'),
        extra: { max: 25, idleTimeoutMillis: 30000, connectionTimeoutMillis: 2000 },
      }),
      inject: [ConfigService],
    }),

    // Feature modules
    AuthModule,
    ProfileModule,
    DeviceModule,
    MediaModule,
    NotificationModule,
    AuditLogModule,
    ChatModule,
    SubscriptionsModule,
    FirebaseAdminModule,
    MonitoringModule,
    VoiceModule,
    GraphModule,
    VideoCallModule,
    CommonCacheModule,
    PersonalizationModule,
    VoiceAssistantModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditLogInterceptor },
  ],
})
export class AppModule { }

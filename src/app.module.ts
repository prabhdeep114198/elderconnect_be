import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';

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

// Modules
import { AuthModule } from './auth/auth.module';
import { ProfileModule } from './profile/profile.module';
import { DeviceModule } from './device/device.module';
import { MediaModule } from './media/media.module';
import { NotificationModule } from './notification/notification.module';
import { AuditLogModule } from './common/services/audit-log.module';
import { ChatModule } from './chat/chat.module';

// Common interceptors
import { AuditLogInterceptor } from './common/interceptors/audit-log.interceptor';

// Entities for different databases
import { User } from './auth/entities/user.entity';
import { Device } from './auth/entities/device.entity';
import { UserProfile } from './profile/entities/user-profile.entity';
import { Medication } from './profile/entities/medication.entity';
import { MedicationLog } from './profile/entities/medication-log.entity';
import { TelemetryData } from './device/entities/telemetry.entity';
import { Vitals } from './device/entities/vitals.entity';
import { SOSAlert } from './device/entities/sos-alert.entity';
import { MediaFile } from './media/entities/media-file.entity';
import { Notification } from './notification/entities/notification.entity';
import { NotificationTemplate } from './notification/entities/notification-template.entity';
import { AuditLog } from './common/services/entities/audit-log.entity';

@Module({
  imports: [
    // Configuration
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
        n8nConfig
      ],
      envFilePath: ['.env.local', '.env'],
    }),

    // Rate limiting
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1, limit: 10 },
      { name: 'medium', ttl: 60, limit: 100 },
      { name: 'long', ttl: 900, limit: 1000 },
    ]),

    // Scheduling
    ScheduleModule.forRoot(),

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
        entities: [User, Device],
        synchronize: configService.get('app.environment') === 'development',
        logging: configService.get('app.environment') === 'development',
        ssl: configService.get('app.environment') === 'production'
          ? { rejectUnauthorized: false }
          : false,
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
        entities: [UserProfile, Medication, MedicationLog],
        synchronize: configService.get('app.environment') === 'development',
        logging: configService.get('app.environment') === 'development',
        ssl: configService.get('app.environment') === 'production'
          ? { rejectUnauthorized: false }
          : false,
        extra: { max: 20, idleTimeoutMillis: 30000, connectionTimeoutMillis: 2000 },
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
        synchronize: configService.get('app.environment') === 'development',
        logging: configService.get('app.environment') === 'development',
        ssl: configService.get('app.environment') === 'production'
          ? { rejectUnauthorized: false }
          : false,
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
        synchronize: configService.get('app.environment') === 'development',
        logging: configService.get('app.environment') === 'development',
        ssl: configService.get('app.environment') === 'production'
          ? { rejectUnauthorized: false }
          : false,
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
        entities: [AuditLog, Notification, NotificationTemplate],
        synchronize: configService.get('app.environment') === 'development',
        logging: configService.get('app.environment') === 'development',
        ssl: configService.get('app.environment') === 'production'
          ? { rejectUnauthorized: false }
          : false,
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
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditLogInterceptor },
  ],
})
export class AppModule { }

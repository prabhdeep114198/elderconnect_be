import { registerAs } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export const databaseConfig = registerAs('database', () => ({
  auth: {
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: 5432,
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.AUTH_DB_NAME || 'elder_auth_db',
    entities: [__dirname + '/../auth/entities/*.entity{.ts,.js}'],
    synchronize: process.env.NODE_ENV !== 'production',
    logging: process.env.NODE_ENV === 'development',
    ssl: process.env.DB_SSL === 'true' || process.env.DB_HOST?.includes('neon.tech') || process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  } as TypeOrmModuleOptions,

  profile: {
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: 5432,
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.PROFILE_DB_NAME || 'elder_profile_db',
    entities: [__dirname + '/../profile/entities/*.entity{.ts,.js}'],
    synchronize: process.env.NODE_ENV !== 'production',
    logging: process.env.NODE_ENV === 'development',
    ssl: process.env.DB_SSL === 'true' || process.env.DB_HOST?.includes('neon.tech') || process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  } as TypeOrmModuleOptions,

  vitals: {
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: 5432,
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.VITALS_DB_NAME || 'elder_vitals_db',
    entities: [__dirname + '/../device/entities/*.entity{.ts,.js}'],
    synchronize: process.env.NODE_ENV !== 'production',
    logging: process.env.NODE_ENV === 'development',
    ssl: process.env.DB_SSL === 'true' || process.env.DB_HOST?.includes('neon.tech') || process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  } as TypeOrmModuleOptions,

  media: {
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: 5432,
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.MEDIA_DB_NAME || 'elder_media_db',
    entities: [__dirname + '/../media/entities/*.entity{.ts,.js}'],
    synchronize: process.env.NODE_ENV !== 'production',
    logging: process.env.NODE_ENV === 'development',
    ssl: process.env.DB_SSL === 'true' || process.env.DB_HOST?.includes('neon.tech') || process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  } as TypeOrmModuleOptions,

  audit: {
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: 5432,
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.AUDIT_DB_NAME || 'elder_audit_db',
    entities: [__dirname + '/../common/entities/*.entity{.ts,.js}'],
    synchronize: process.env.NODE_ENV !== 'production',
    logging: process.env.NODE_ENV === 'development',
    ssl: process.env.DB_SSL === 'true' || process.env.DB_HOST?.includes('neon.tech') || process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  } as TypeOrmModuleOptions,
}));

export const redisConfig = registerAs('redis', () => ({
  host: process.env.REDIS_HOST || 'localhost',
  port: 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  db: 0,
}));

export const kafkaConfig = registerAs('kafka', () => ({
  clientId: process.env.KAFKA_CLIENT_ID || 'elder-connect-api',
  brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
  groupId: 'elder-connect-group',
}));

import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { config } from 'dotenv';

config();

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || process.env.DATABASE_PROFILE_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || process.env.DATABASE_PROFILE_PORT || '5432', 10),
  username: process.env.DB_USERNAME || process.env.DATABASE_PROFILE_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || process.env.DATABASE_PROFILE_PASSWORD || 'postgres',
  database: process.env.PROFILE_DB_NAME || process.env.DATABASE_PROFILE_DATABASE || 'elder_profile_db',
  synchronize: false,
  logging: process.env.NODE_ENV === 'development' || true,
  entities: ['src/profile/entities/*.entity.ts'],
  // Explicitly reference the new migration to avoid picking up stray compiled files
  migrations: ['src/migrations/profile/1697328000000-AddOxygenSaturationToDailyHealthMetrics.ts'],
});

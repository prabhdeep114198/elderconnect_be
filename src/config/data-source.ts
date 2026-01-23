import { DataSource, DataSourceOptions } from 'typeorm';
import { config } from 'dotenv';

config();

const baseConfig: Partial<DataSourceOptions> = {
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    synchronize: false, // NEVER use synchronize in production
    logging: process.env.NODE_ENV === 'development',
};

// Auth Database
export const authDataSource = new DataSource({
    ...baseConfig,
    database: process.env.AUTH_DB_NAME || 'elder_auth_db',
    entities: ['src/auth/entities/*.entity.ts'],
    migrations: ['src/migrations/auth/*.ts'],
    migrationsTableName: 'migrations_auth',
} as DataSourceOptions);

// Profile Database
export const profileDataSource = new DataSource({
    ...baseConfig,
    database: process.env.PROFILE_DB_NAME || 'elder_profile_db',
    entities: ['src/profile/entities/*.entity.ts'],
    migrations: ['src/migrations/profile/*.ts'],
    migrationsTableName: 'migrations_profile',
} as DataSourceOptions);

// Vitals Database
export const vitalsDataSource = new DataSource({
    ...baseConfig,
    database: process.env.VITALS_DB_NAME || 'elder_vitals_db',
    entities: ['src/device/entities/*.entity.ts'],
    migrations: ['src/migrations/vitals/*.ts'],
    migrationsTableName: 'migrations_vitals',
} as DataSourceOptions);

// Media Database
export const mediaDataSource = new DataSource({
    ...baseConfig,
    database: process.env.MEDIA_DB_NAME || 'elder_media_db',
    entities: ['src/media/entities/*.entity.ts'],
    migrations: ['src/migrations/media/*.ts'],
    migrationsTableName: 'migrations_media',
} as DataSourceOptions);

// Audit Database
export const auditDataSource = new DataSource({
    ...baseConfig,
    database: process.env.AUDIT_DB_NAME || 'elder_audit_db',
    entities: ['src/common/entities/*.entity.ts'],
    migrations: ['src/migrations/audit/*.ts'],
    migrationsTableName: 'migrations_audit',
} as DataSourceOptions);

export default authDataSource;

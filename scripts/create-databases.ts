import { Client } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const databases = [
    process.env.AUTH_DB_NAME || 'elder_auth_db',
    process.env.PROFILE_DB_NAME || 'elder_profile_db',
    process.env.VITALS_DB_NAME || 'elder_vitals_db',
    process.env.MEDIA_DB_NAME || 'elder_media_db',
    process.env.AUDIT_DB_NAME || 'elder_audit_db',
    process.env.DB_NAME || 'elder_notification_db',
];

async function createDatabases() {
    const client = new Client({
        user: process.env.DB_USERNAME || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        database: 'postgres', // Connect to default postgres db
    });

    try {
        await client.connect();
        console.log('Connected to PostgreSQL');

        for (const dbName of databases) {
            try {
                const res = await client.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [dbName]);
                if (res.rowCount === 0) {
                    await client.query(`CREATE DATABASE ${dbName}`);
                    console.log(`Successfully created database: ${dbName}`);
                } else {
                    console.log(`Database already exists: ${dbName}`);
                }
            } catch (err) {
                console.error(`Error creating database ${dbName}:`, err.message);
            }
        }
    } catch (err) {
        console.error('Failed to connect to PostgreSQL:', err.message);
    } finally {
        await client.end();
    }
}

createDatabases();

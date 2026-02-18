const { Client } = require('pg');
const crypto = require('crypto');

const profileConfig = {
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'postgres',
    database: 'elder_profile_db',
};

const vitalsConfig = {
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'postgres',
    database: 'elder_vitals_db',
};

const userId = '8585b62d-d28b-4beb-b37c-97d640615155';
const profileId = '03d91024-2e34-4dc0-a7a9-099019c190af';

async function seed() {
    const profileClient = new Client(profileConfig);
    const vitalsClient = new Client(vitalsConfig);

    try {
        await profileClient.connect();
        await vitalsClient.connect();
        console.log('Connected to both databases');

        const now = new Date();

        // Clear old vitals for the last 10 days for this user to avoid duplicates
        const tenDaysAgo = new Date(now);
        tenDaysAgo.setDate(now.getDate() - 10);

        await vitalsClient.query('DELETE FROM vitals WHERE "userId" = $1 AND "recordedAt" >= $2', [userId, tenDaysAgo.toISOString()]);
        console.log('Cleared old vitals data');

        for (let i = 0; i < 11; i++) { // 0 to 10 inclusive = 11 days (to be safe)
            const date = new Date(now);
            date.setDate(now.getDate() - i);
            const dateString = date.toISOString().split('T')[0];
            const timestamp = date.toISOString();

            console.log(`Seeding data for ${dateString}...`);

            // 1. Daily Health Metrics
            const steps = Math.floor(Math.random() * 4000) + 4000;
            const hr = Math.floor(Math.random() * 20) + 65;
            const sleep = parseFloat((Math.random() * 2 + 6).toFixed(1));
            const water = Math.floor(Math.random() * 5) + 5;
            const spo2 = Math.floor(Math.random() * 5) + 95;

            const metricQuery = `
                INSERT INTO daily_health_metrics 
                (id, "userProfileId", date, steps, "heartRate", "sleepHours", "waterIntake", "oxygenSaturation", "createdAt", "updatedAt")
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
                ON CONFLICT ("userProfileId", date) DO UPDATE SET
                steps = EXCLUDED.steps,
                "heartRate" = EXCLUDED."heartRate",
                "sleepHours" = EXCLUDED."sleepHours",
                "waterIntake" = EXCLUDED."waterIntake",
                "oxygenSaturation" = EXCLUDED."oxygenSaturation",
                "updatedAt" = NOW()
            `;
            await profileClient.query(metricQuery, [
                crypto.randomUUID(),
                profileId,
                dateString,
                steps,
                hr,
                sleep,
                water,
                spo2
            ]);

            // 2. Vitals (Heart Rate) - multiple times a day
            const vitalHrQuery = `
                INSERT INTO vitals (id, "userId", "vitalType", reading, unit, "recordedAt", "recordedBy", "isAbnormal", "requiresAttention", "createdAt", "updatedAt")
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
            `;

            // Morning
            const morning = new Date(date);
            morning.setHours(8, 0, 0, 0);
            await vitalsClient.query(vitalHrQuery, [
                crypto.randomUUID(),
                userId,
                'heart_rate',
                JSON.stringify({ bpm: hr + (Math.random() * 5 - 2) }),
                'bpm',
                morning.toISOString(),
                'device',
                false,
                false
            ]);

            // Evening
            const evening = new Date(date);
            evening.setHours(20, 0, 0, 0);
            await vitalsClient.query(vitalHrQuery, [
                crypto.randomUUID(),
                userId,
                'heart_rate',
                JSON.stringify({ bpm: hr + (Math.random() * 5 - 2) }),
                'bpm',
                evening.toISOString(),
                'device',
                false,
                false
            ]);

            // 3. Vitals (Blood Pressure)
            const systolic = Math.floor(Math.random() * 20) + 115;
            const diastolic = Math.floor(Math.random() * 10) + 75;
            await vitalsClient.query(vitalHrQuery, [
                crypto.randomUUID(),
                userId,
                'blood_pressure',
                JSON.stringify({ systolic, diastolic }),
                'mmHg',
                timestamp,
                'device',
                false,
                false
            ]);

            // 4. Vitals (Oxygen Saturation)
            await vitalsClient.query(vitalHrQuery, [
                crypto.randomUUID(),
                userId,
                'oxygen_saturation',
                JSON.stringify({ percentage: spo2 }),
                '%',
                timestamp,
                'device',
                false,
                false
            ]);
        }

        console.log('Seeding completed successfully');
    } catch (err) {
        console.error('Error seeding data:', err);
    } finally {
        await profileClient.end();
        await vitalsClient.end();
    }
}

seed();

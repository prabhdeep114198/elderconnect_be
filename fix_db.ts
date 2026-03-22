import { DataSource } from "typeorm";
import * as dotenv from 'dotenv';
dotenv.config();

const profileDataSource = new DataSource({
  type: "postgres",
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: "elder_profile_db",
  ssl: process.env.DB_SSL === 'true',
});

async function run() {
  await profileDataSource.initialize();
  await profileDataSource.query(`
      DELETE FROM "daily_health_metrics"
      WHERE "userProfileId" = (SELECT id FROM "user_profiles" WHERE "userId" = '9924bb47-f29a-49d0-9a8a-6419124275a9' LIMIT 1) AND "steps" > 100000;
  `);
  
  await profileDataSource.query(`
      UPDATE "daily_health_metrics" SET "steps" = 0
      WHERE "userProfileId" = (SELECT id FROM "user_profiles" WHERE "userId" = '9924bb47-f29a-49d0-9a8a-6419124275a9' LIMIT 1) AND "date" = '2026-03-23';
  `);
  console.log("DB Fixed again");
  await profileDataSource.destroy();
}
run().catch(console.error);

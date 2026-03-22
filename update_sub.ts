import { DataSource } from "typeorm";
import * as dotenv from 'dotenv';
dotenv.config();

const authDataSource = new DataSource({
  type: "postgres",
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.AUTH_DB_NAME,
  ssl: process.env.DB_SSL === 'true',
});

async function run() {
  await authDataSource.initialize();
  console.log("Connected to Auth DB");

  const results = await authDataSource.query(`
    UPDATE "users"
    SET "isSubscribed" = true,
        "subscriptionTier" = 'PREMIUM',
        "subscriptionExpiresAt" = NOW() + INTERVAL '30 days'
    WHERE "email" = 'sprabhdeep960@gmail.com'
    RETURNING id;
  `);

  if (!results[0] || results[0].length === 0) {
      console.log("User not found!");
  } else {
      console.log("Updated user ID:", results[0][0].id);
      const userId = results[0][0].id;
      
      const subUpdate = await authDataSource.query(`
        UPDATE "subscriptions"
        SET "status" = 'active',
            "startDate" = NOW(),
            "endDate" = NOW() + INTERVAL '30 days',
            "planTier" = 'PREMIUM'
        WHERE "userId" = $1 AND "status" = 'pending';
      `, [userId]);
      console.log("Updated subscription:", subUpdate);
  }

  await authDataSource.destroy();
}

run().catch(console.error);

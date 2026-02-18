const { Client } = require('pg');

const client = new Client({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'postgres',
  database: 'elder_profile_db', // Profile DB
});

async function run() {
  try {
    await client.connect();
    console.log('Connected to DB');

    const userId = '4c63e625-af86-4188-a382-ddeff32d5add';

    // Get Profile ID
    const res = await client.query('SELECT id FROM user_profiles WHERE "userId" = $1', [userId]);
    if (res.rows.length === 0) {
      console.log('Profile not found for user');
      return;
    }
    const profileId = res.rows[0].id;
    console.log('Found profile ID:', profileId);

    // Insert Event
    const event = {
      id: '550e8400-e29b-41d4-a716-446655440000', // Random UUID
      hostId: profileId,
      title: 'Community Yoga 2026',
      description: 'Morning yoga session for everyone.',
      location: 'Central Park',
      scheduledAt: new Date(new Date().getTime() + 86400000).toISOString(), // Tomorrow
      category: 'health'
    };

    const insertQuery = `
      INSERT INTO social_events (id, "hostId", title, description, location, "scheduledAt", category, "createdAt", "updatedAt")
      VALUES ('${event.id}', '${event.hostId}', '${event.title}', '${event.description}', '${event.location}', '${event.scheduledAt}', '${event.category}', NOW(), NOW())
    `;
    
    await client.query(insertQuery);
    console.log('Event inserted successfully');

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.end();
  }
}

run();

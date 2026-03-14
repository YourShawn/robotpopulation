/*
  Usage:
    DATABASE_URL=postgres://user:pass@host:5432/db node scripts/seed_loader.js

  Requires tables:
    companies(slug unique), cities(city_key unique), canonical_events(fingerprint unique)
*/

const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), file), 'utf8'));
}

async function run() {
  if (!process.env.DATABASE_URL) {
    throw new Error('Missing DATABASE_URL');
  }

  const companies = readJson('seeds/seed_companies.json');
  const cities = readJson('seeds/seed_cities.json');
  const events = readJson('seeds/seed_canonical_events.json');

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await client.query('BEGIN');

    for (const c of companies) {
      await client.query(
        `INSERT INTO companies (name, slug, country, robot_type, website, status, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,NOW())
         ON CONFLICT (slug)
         DO UPDATE SET
           name = EXCLUDED.name,
           country = EXCLUDED.country,
           robot_type = EXCLUDED.robot_type,
           website = EXCLUDED.website,
           status = EXCLUDED.status,
           updated_at = NOW()`,
        [c.name, c.slug, c.country, c.robot_type, c.website, c.status]
      );
    }

    for (const c of cities) {
      await client.query(
        `INSERT INTO cities (city, state, country, lat, lng, city_key, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,NOW())
         ON CONFLICT (city_key)
         DO UPDATE SET
           city = EXCLUDED.city,
           state = EXCLUDED.state,
           country = EXCLUDED.country,
           lat = EXCLUDED.lat,
           lng = EXCLUDED.lng,
           updated_at = NOW()`,
        [c.city, c.state, c.country, c.lat, c.lng, c.city_key]
      );
    }

    for (const e of events) {
      const companyRes = await client.query('SELECT id FROM companies WHERE slug = $1 LIMIT 1', [e.company_slug]);
      const cityRes = await client.query('SELECT id FROM cities WHERE city_key = $1 LIMIT 1', [e.city_key]);
      if (!companyRes.rows[0] || !cityRes.rows[0]) continue;

      await client.query(
        `INSERT INTO canonical_events (
          company_id, city_id, robot_type, event_type, event_month,
          robot_count, source_count, confidence, fingerprint,
          first_seen_at, last_seen_at, created_at, updated_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),NOW()
        )
        ON CONFLICT (fingerprint)
        DO UPDATE SET
          robot_count = EXCLUDED.robot_count,
          source_count = GREATEST(canonical_events.source_count, EXCLUDED.source_count),
          confidence = GREATEST(canonical_events.confidence, EXCLUDED.confidence),
          first_seen_at = LEAST(canonical_events.first_seen_at, EXCLUDED.first_seen_at),
          last_seen_at = GREATEST(canonical_events.last_seen_at, EXCLUDED.last_seen_at),
          updated_at = NOW()`,
        [
          companyRes.rows[0].id,
          cityRes.rows[0].id,
          e.robot_type,
          e.event_type,
          e.event_month,
          e.robot_count,
          e.source_count,
          e.confidence,
          e.fingerprint,
          e.first_seen_at,
          e.last_seen_at
        ]
      );
    }

    await client.query('COMMIT');
    console.log(`Seed import complete: companies=${companies.length}, cities=${cities.length}, canonical_events=${events.length}`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    await client.end();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

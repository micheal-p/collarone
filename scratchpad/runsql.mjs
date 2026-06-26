// Run a SQL file against Supabase via the Session pooler.
// Usage: DB_URL=postgresql://... node scratchpad/runsql.mjs supabase/tasks.sql
import { readFileSync } from 'fs';
import pg from 'pg';

const url = process.env.DB_URL;
if (!url) { console.error('Set DB_URL env var'); process.exit(1); }
const file = process.argv[2];
if (!file) { console.error('Usage: DB_URL=... node scratchpad/runsql.mjs <file.sql>'); process.exit(1); }

const sql = readFileSync(file, 'utf8');
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query(sql);
  console.log(`✓ Applied ${file}`);
} catch (e) {
  console.error('Error:', e.message);
  process.exit(1);
} finally {
  await client.end();
}

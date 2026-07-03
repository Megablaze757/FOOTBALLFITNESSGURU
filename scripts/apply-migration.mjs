// One-off migration runner. Usage:
//   SUPABASE_DB_URL="postgres://..." node scripts/apply-migration.mjs <file.sql>
// Reads the SQL file and executes it against the connection string in
// SUPABASE_DB_URL. Intended for the dummy/dev database only.
import { readFileSync } from "node:fs";
import { Client } from "pg";

const file = process.argv[2] ?? "supabase/migrations/0001_phase1_core.sql";
const connectionString = process.env.SUPABASE_DB_URL;

if (!connectionString) {
  console.error("Set SUPABASE_DB_URL before running.");
  process.exit(1);
}

const sql = readFileSync(file, "utf8");
const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  await client.query(sql);
  console.log(`Applied ${file} successfully.`);
} catch (err) {
  console.error("Migration failed:", err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}

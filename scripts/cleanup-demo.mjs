// Removes the seeded demo accounts (athlete/admin/coach @example.com) and their
// data. RUN THIS BEFORE PRODUCTION — the seeded admin has a known password.
// Usage: SUPABASE_PROJECT_REF=.. SUPABASE_DB_PASSWORD=.. node scripts/cleanup-demo.mjs
import { Client } from "pg";

const cs =
  process.env.SUPABASE_DB_URL ??
  `postgresql://postgres.${process.env.SUPABASE_PROJECT_REF}:${process.env.SUPABASE_DB_PASSWORD}@aws-0-${process.env.SUPABASE_REGION ?? "eu-west-3"}.pooler.supabase.com:5432/postgres`;

const c = new Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
await c.connect();
// ON DELETE CASCADE from auth.users → profiles → all app tables cleans everything up.
const { rowCount } = await c.query(
  "delete from auth.users where email in ('athlete@example.com','admin@example.com','coach@example.com')"
);
console.log(`removed ${rowCount} demo account(s) and their data`);
await c.end();

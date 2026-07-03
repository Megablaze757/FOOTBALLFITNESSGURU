// Verifies the live schema: tables, functions, RLS, storage bucket.
import { Client } from "pg";

const REF = process.env.SUPABASE_PROJECT_REF;
const PASSWORD = process.env.SUPABASE_DB_PASSWORD;
const REGION = process.env.SUPABASE_REGION ?? "eu-west-3";
const cs =
  process.env.SUPABASE_DB_URL ??
  `postgresql://postgres.${REF}:${PASSWORD}@aws-0-${REGION}.pooler.supabase.com:5432/postgres`;

const client = new Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
await client.connect();

const q = async (label, sql) => {
  const { rows } = await client.query(sql);
  console.log(`\n== ${label} ==`);
  for (const r of rows) console.log(" ", Object.values(r).join("  "));
};

await q("Tables (public)",
  `select tablename, rowsecurity as rls from pg_tables where schemaname='public' order by tablename`);
await q("Functions (public)",
  `select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and proname in
   ('current_tier','is_admin','admin_metrics','handle_new_user','set_updated_at') order by proname`);
await q("RLS policy count per table",
  `select tablename, count(*) from pg_policies where schemaname='public' group by tablename order by tablename`);
await q("Storage bucket",
  `select id, public from storage.buckets where id='videos'`);

await client.end();
console.log("\nVerification complete.");

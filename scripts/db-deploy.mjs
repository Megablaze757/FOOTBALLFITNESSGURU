// Finds a reachable connection to the Supabase project (direct host or the
// IPv4 connection pooler across regions) and applies all migrations in order.
//
// Usage:
//   SUPABASE_DB_URL="postgres://..." node scripts/db-deploy.mjs   # explicit
//   SUPABASE_PROJECT_REF=xxx SUPABASE_DB_PASSWORD=yyy node scripts/db-deploy.mjs
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Client } from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "..", "supabase", "migrations");

const REF = process.env.SUPABASE_PROJECT_REF;
const PASSWORD = process.env.SUPABASE_DB_PASSWORD;

const REGIONS = [
  "us-east-1", "us-east-2", "us-west-1", "us-west-2",
  "eu-west-1", "eu-west-2", "eu-west-3", "eu-central-1", "eu-central-2", "eu-north-1",
  "ap-southeast-1", "ap-southeast-2", "ap-northeast-1", "ap-northeast-2", "ap-south-1",
  "sa-east-1", "ca-central-1",
];

function candidates() {
  const list = [];
  if (process.env.SUPABASE_DB_URL) list.push(process.env.SUPABASE_DB_URL);
  if (REF && PASSWORD) {
    list.push(`postgresql://postgres:${PASSWORD}@db.${REF}.supabase.co:5432/postgres`);
    for (const r of REGIONS) {
      // Session pooler (IPv4), supports DDL.
      list.push(`postgresql://postgres.${REF}:${PASSWORD}@aws-0-${r}.pooler.supabase.com:5432/postgres`);
    }
  }
  return list;
}

async function tryConnect(connectionString) {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 8000,
    statement_timeout: 120000,
  });
  try {
    await client.connect();
    await client.query("select 1");
    return client;
  } catch (e) {
    try { await client.end(); } catch {}
    return { error: e.message };
  }
}

async function main() {
  const cands = candidates();
  if (!cands.length) {
    console.error("Set SUPABASE_DB_URL, or SUPABASE_PROJECT_REF + SUPABASE_DB_PASSWORD.");
    process.exit(1);
  }

  let client = null;
  for (const cs of cands) {
    const host = cs.replace(/:[^:@]+@/, ":****@").split("@")[1]?.split("/")[0];
    process.stdout.write(`trying ${host} … `);
    const res = await tryConnect(cs);
    if (res instanceof Client) {
      console.log("connected");
      client = res;
      break;
    }
    console.log(`no (${res.error})`);
  }

  if (!client) {
    console.error("\nCould not reach the database on any candidate host.");
    console.error("If the project is paused, resume it in the Supabase dashboard and retry.");
    process.exit(2);
  }

  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, f), "utf8");
    process.stdout.write(`applying ${f} … `);
    try {
      await client.query(sql);
      console.log("ok");
    } catch (e) {
      console.log("FAILED");
      console.error(`  ${e.message}`);
      await client.end();
      process.exit(3);
    }
  }

  await client.end();
  console.log("\nAll migrations applied.");
}

main();

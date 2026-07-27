import { Client } from "pg";
const REGIONS=["us-east-1","us-east-2","us-west-1","us-west-2","eu-west-1","eu-west-2","eu-west-3","eu-central-1","eu-central-2","eu-north-1","ap-southeast-1","ap-southeast-2","ap-northeast-1","ap-northeast-2","ap-south-1","sa-east-1","ca-central-1"];
const REF="txqhstackgidjqkkrzyj", PW=process.env.PGPW;
async function connect(){for(const cs of [`postgresql://postgres:${PW}@db.${REF}.supabase.co:5432/postgres`,...REGIONS.map(r=>`postgresql://postgres.${REF}:${PW}@aws-0-${r}.pooler.supabase.com:5432/postgres`)]){const c=new Client({connectionString:cs,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:8000});try{await c.connect();await c.query("select 1");return c;}catch{try{await c.end();}catch{}}}throw new Error("no reachable host");}
const c = await connect();

const { rows: tables } = await c.query(`
  select table_name, string_agg(column_name, ', ' order by ordinal_position) as cols
    from information_schema.columns
   where table_schema='public'
     and table_name in ('waitlist','ai_usage','videos','video_uploads','ai_budget','notifications')
   group by 1 order by 1`);
for (const t of tables) console.log(`\n${t.table_name}:\n  ${t.cols}`);

const { rows: counts } = await c.query(`
  select relname as table_name, n_live_tup as approx_rows
    from pg_stat_user_tables where schemaname='public' and n_live_tup > 0
   order by n_live_tup desc limit 20`);
console.log("\n### row counts");
console.table(counts);

await c.end();

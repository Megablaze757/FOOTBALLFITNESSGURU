import { Client } from "pg";
const REGIONS=["us-east-1","us-east-2","us-west-1","us-west-2","eu-west-1","eu-west-2","eu-west-3","eu-central-1","eu-central-2","eu-north-1","ap-southeast-1","ap-southeast-2","ap-northeast-1","ap-northeast-2","ap-south-1","sa-east-1","ca-central-1"];
const REF="txqhstackgidjqkkrzyj", PW=process.env.PGPW;
async function connect(){for(const cs of [`postgresql://postgres:${PW}@db.${REF}.supabase.co:5432/postgres`,...REGIONS.map(r=>`postgresql://postgres.${REF}:${PW}@aws-0-${r}.pooler.supabase.com:5432/postgres`)]){const c=new Client({connectionString:cs,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:8000});try{await c.connect();await c.query("select 1");return c;}catch{try{await c.end();}catch{}}}throw new Error("no reachable host");}
const c = await connect();

const q = async (label, sql) => {
  try { const { rows } = await c.query(sql); console.log(`\n### ${label}`); console.table(rows); }
  catch (e) { console.log(`\n### ${label}\n  (n/a: ${e.message})`); }
};

await q("subscriptions", `select tier, status, count(*)::int as n,
  count(*) filter (where stripe_subscription_id is not null)::int as paying
  from public.subscriptions group by 1,2 order by 1,2`);

await q("waitlist", `select count(*)::int as total,
  count(*) filter (where created_at > now() - interval '7 days')::int as last7,
  count(distinct referred_by)::int as referrers from public.waitlist`);

await q("real usage", `select
  (select count(*)::int from public.profiles)                as profiles,
  (select count(*)::int from public.daily_check_ins)         as check_ins,
  (select count(*)::int from public.programs)                as programs,
  (select count(*)::int from public.training_logs)           as logs,
  (select count(*)::int from public.video_analyses)          as videos`);

await q("AI spend to date", `select coalesce(sum(cost_usd),0)::numeric(10,4) as total_usd,
  count(*)::int as calls, max(created_at) as latest from public.ai_usage`);

await q("tables missing RLS", `select c.relname as table_name
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' and not c.relrowsecurity`);

await q("admins", `select p.id, u.email, p.role from public.profiles p
  join auth.users u on u.id=p.id where p.role='admin'`);

await q("migrations applied", `select count(*)::int as applied, max(name) as latest from public.schema_migrations`);

await c.end();

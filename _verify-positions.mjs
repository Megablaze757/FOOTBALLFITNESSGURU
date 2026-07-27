import { Client } from "pg";
const REGIONS=["us-east-1","us-east-2","us-west-1","us-west-2","eu-west-1","eu-west-2","eu-west-3","eu-central-1","eu-central-2","eu-north-1","ap-southeast-1","ap-southeast-2","ap-northeast-1","ap-northeast-2","ap-south-1","sa-east-1","ca-central-1"];
const REF="txqhstackgidjqkkrzyj", PW=process.env.PGPW;
async function connect(){for(const cs of [`postgresql://postgres:${PW}@db.${REF}.supabase.co:5432/postgres`,...REGIONS.map(r=>`postgresql://postgres.${REF}:${PW}@aws-0-${r}.pooler.supabase.com:5432/postgres`)]){const c=new Client({connectionString:cs,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:8000});try{await c.connect();await c.query("select 1");return c;}catch{try{await c.end();}catch{}}}throw new Error("no reachable host");}
const c = await connect();

const { rows: col } = await c.query(`
  select data_type, is_nullable, column_default
    from information_schema.columns
   where table_schema='public' and table_name='profiles' and column_name='positions'
`);
console.log("positions column:", col[0] ?? "MISSING");

const { rows } = await c.query(`
  select full_name, sport, position, positions
    from public.profiles
   order by created_at desc nulls last
   limit 12
`);
for (const r of rows) {
  console.log((r.full_name ?? "—").padEnd(22), (r.sport ?? "—").padEnd(12), "single:", String(r.position ?? "—").padEnd(16), "array:", JSON.stringify(r.positions));
}

const { rows: agg } = await c.query(`
  select count(*)::int as total,
         count(*) filter (where position is not null and position <> '')::int as has_single,
         count(*) filter (where cardinality(positions) > 0)::int as has_array,
         count(*) filter (where position is not null and position <> ''
                            and (positions is null or positions[1] is distinct from position))::int as out_of_step
    from public.profiles
`);
console.log("\n", agg[0]);
await c.end();
